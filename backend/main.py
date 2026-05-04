from __future__ import annotations

from datetime import datetime, timedelta, timezone
from pathlib import Path
from typing import List, Optional
from uuid import uuid4

import bcrypt
from fastapi import Cookie, Depends, BackgroundTasks, FastAPI, File, Form, Header, HTTPException, Response, UploadFile, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy import or_
from sqlalchemy.orm import Session
from fastapi_mail import ConnectionConfig, FastMail, MessageSchema, MessageType
from dotenv import load_dotenv
import os

from .config import settings
from .database import Base, engine, get_db
from .models import (
    Book,
    DimensionNote,
    ImageMarker,
    Page,
    PageImage,
    PasswordResetToken,
    Reminder,
    SessionToken,
    User,
)
from .schemas import (
    AuthResponse,
    BookCreate,
    BookDetail,
    BookRead,
    DashboardStats,
    LoginRequest,
    PageRead,
    PasswordResetConfirm,
    PasswordResetRequest,
    ReminderCreate,
    ReminderRead,
    SignupRequest,
    UserRead,
    UserUpdate,
)

# Email Configuration
conf = ConnectionConfig(
    MAIL_USERNAME=settings.MAIL_USERNAME,
    MAIL_PASSWORD=settings.MAIL_PASSWORD,
    MAIL_FROM=settings.MAIL_FROM,
    MAIL_PORT=settings.MAIL_PORT,
    MAIL_SERVER=settings.MAIL_SERVER,
    MAIL_STARTTLS=settings.MAIL_STARTTLS,
    MAIL_SSL_TLS=settings.MAIL_SSL_TLS,
    USE_CREDENTIALS=settings.USE_CREDENTIALS,
    VALIDATE_CERTS=settings.VALIDATE_CERTS
)

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

SESSION_TTL = timedelta(days=7)
RESET_TTL = timedelta(hours=2)

# Only create tables locally or if not using Supabase
if not os.getenv("SUPABASE_URL"):
    Base.metadata.create_all(bind=engine)

app = FastAPI(title="StudioNotebook API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5500",
        "http://127.0.0.1:5500",
        "https://studio-notebook.vercel.app", # Replace with your actual Vercel URL
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


def _hash_password(password: str) -> str:
    hashed = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    return hashed.decode("utf-8")


def _verify_password(password: str, password_hash: str) -> bool:
    return bcrypt.checkpw(password.encode("utf-8"), password_hash.encode("utf-8"))


def _issue_session(user: User, db: Session) -> SessionToken:
    now = datetime.now(timezone.utc)
    # Ensure expiration is at least 7 days from now
    expiration = now + SESSION_TTL
    session_token = SessionToken(
        token=uuid4().hex,
        user_id=user.id,
        expires_at=expiration,
        csrf_token=uuid4().hex,
    )
    db.add(session_token)
    db.commit()
    db.refresh(session_token)
    return session_token


def _set_session_cookies(response: Response, session: SessionToken) -> None:
    max_age = int(SESSION_TTL.total_seconds())
    response.set_cookie(
        key="session",
        value=session.token,
        max_age=max_age,
        httponly=True,
        samesite="lax",
        secure=False,
        path="/", # Explicitly set path to root
    )
    response.set_cookie(
        key="csrf_token",
        value=session.csrf_token,
        max_age=max_age,
        httponly=False,
        samesite="lax",
        secure=False,
        path="/", # Explicitly set path to root
    )


def _clear_session_cookies(response: Response) -> None:
    response.delete_cookie("session", path="/")
    response.delete_cookie("csrf_token", path="/")


def _require_csrf(session: SessionToken, csrf_header: Optional[str]) -> None:
    if not csrf_header or csrf_header != session.csrf_token:
        raise HTTPException(status_code=403, detail="CSRF token missing or invalid")


def _parse_timestamp(value: str) -> datetime:
    if not value:
        return datetime.now(timezone.utc)
    parsed = datetime.fromisoformat(value)
    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=timezone.utc)
    return parsed.astimezone(timezone.utc)


def _ensure_aware(value: datetime) -> datetime:
    if value.tzinfo is None:
        return value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc)


def _get_active_session(
    session_cookie: Optional[str] = Cookie(None, alias="session"),
    db: Session = Depends(get_db),
) -> SessionToken:
    # Debug print to check incoming cookie
    # print(f"DEBUG: session_cookie={session_cookie}")
    if not session_cookie:
        raise HTTPException(status_code=401, detail="Missing session")
    session_token = db.query(SessionToken).filter(SessionToken.token == session_cookie).first()
    if not session_token:
        raise HTTPException(status_code=401, detail="Invalid session")
    
    # SQLite might return datetime strings. SQLAlchemy usually handles it, 
    # but we ensure it's timezone-aware for comparison.
    expires_at = _ensure_aware(session_token.expires_at)
    now = datetime.now(timezone.utc)
    
    if expires_at <= now:
        raise HTTPException(status_code=401, detail="Session expired")
    return session_token


def _get_current_user(session: SessionToken = Depends(_get_active_session)) -> User:
    return session.user


def _get_book_or_404(book_id: int, user: User, db: Session) -> Book:
    book = db.query(Book).filter(Book.id == book_id, Book.user_id == user.id).first()
    if not book:
        raise HTTPException(status_code=404, detail="Book not found")
    return book


def _get_page_or_404(page_id: int, user: User, db: Session) -> Page:
    page = db.query(Page).join(Book).filter(Page.id == page_id, Book.user_id == user.id).first()
    if not page:
        raise HTTPException(status_code=404, detail="Page not found")
    return page


def _get_image_or_404(image_id: int, user: User, db: Session) -> PageImage:
    image = (
        db.query(PageImage)
        .join(Page)
        .join(Book)
        .filter(PageImage.id == image_id, Book.user_id == user.id)
        .first()
    )
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    return image


def _to_page_schema(page: Page) -> PageRead:
    return PageRead.model_validate(page)


def _cleanup_image_file(file_path: str) -> None:
    full_path = BASE_DIR / file_path
    if full_path.exists():
        full_path.unlink()


async def _attach_images(files: Optional[List[UploadFile]], page: Page, db: Session) -> None:
    if not files:
        return
    for file in files:
        if file is None or not file.filename:
            continue
        extension = Path(file.filename).suffix or ""
        unique_name = f"{uuid4().hex}{extension}"
        destination = UPLOAD_DIR / unique_name
        data = await file.read()
        destination.write_bytes(data)
        relative_path = f"uploads/{unique_name}"
        db_image = PageImage(page_id=page.id, file_path=relative_path)
        db.add(db_image)
    db.commit()
    db.refresh(page)


@app.get("/")
def healthcheck():
    return {"message": "StudioNotebook API is running"}


@app.post("/signup", response_model=AuthResponse, status_code=201)
def signup(payload: SignupRequest, response: Response, db: Session = Depends(get_db)):
    username_taken = db.query(User).filter(User.username == payload.username).first()
    email_taken = db.query(User).filter(User.email == payload.email).first()
    if username_taken or email_taken:
        raise HTTPException(status_code=400, detail="Username or email already exists")
    user = User(
        username=payload.username,
        email=payload.email.lower().strip(),
        password_hash=_hash_password(payload.password),
    )
    db.add(user)
    db.commit()
    db.refresh(user)
    session = _issue_session(user, db)
    _set_session_cookies(response, session)
    return AuthResponse(user=UserRead.model_validate(user), csrf_token=session.csrf_token)


@app.post("/login", response_model=AuthResponse)
def login(payload: LoginRequest, response: Response, db: Session = Depends(get_db)):
    identifier = payload.username_or_email.lower().strip()
    user = db.query(User).filter(or_(User.username == identifier, User.email == identifier)).first()
    if not user or not _verify_password(payload.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")
    session = _issue_session(user, db)
    _set_session_cookies(response, session)
    return AuthResponse(user=UserRead.model_validate(user), csrf_token=session.csrf_token)


@app.post("/logout")
def logout(
    response: Response,
    csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
    session_token: SessionToken = Depends(_get_active_session),
    db: Session = Depends(get_db),
):
    _require_csrf(session_token, csrf_token)
    db.delete(session_token)
    db.commit()
    _clear_session_cookies(response)
    return {"message": "Logged out"}


async def _send_reset_email(email: str, token: str):
    message = MessageSchema(
        subject="StudioNotebook Password Reset",
        recipients=[email],
        body=f"Your password reset code is: {token}\n\nThis code will expire in 2 hours.",
        subtype=MessageType.plain
    )
    fm = FastMail(conf)
    await fm.send_message(message)


@app.post("/password-reset", status_code=202)
async def request_password_reset(
    payload: PasswordResetRequest, 
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db)
):
    user = db.query(User).filter(User.email == payload.email.lower().strip()).first()
    if not user:
        return {"message": "If the email exists, a reset link will be sent."}
    token = PasswordResetToken(
        token=uuid4().hex[:8].upper(), # Use a shorter, user-friendly code
        user_id=user.id,
        expires_at=datetime.now(timezone.utc) + RESET_TTL,
    )
    db.add(token)
    db.commit()
    
    background_tasks.add_task(_send_reset_email, user.email, token.token)
    
    return {"message": "If the email exists, a reset link will be sent."}


@app.post("/password-reset/confirm")
def confirm_password_reset(payload: PasswordResetConfirm, db: Session = Depends(get_db)):
    reset_token = (
        db.query(PasswordResetToken)
        .filter(PasswordResetToken.token == payload.token)
        .first()
    )
    if not reset_token or reset_token.used_at is not None:
        raise HTTPException(status_code=400, detail="Reset token invalid")
    if _ensure_aware(reset_token.expires_at) <= datetime.now(timezone.utc):
        raise HTTPException(status_code=400, detail="Reset token expired")
    reset_token.user.password_hash = _hash_password(payload.password)
    reset_token.used_at = datetime.now(timezone.utc)
    db.query(SessionToken).filter(SessionToken.user_id == reset_token.user_id).delete(
        synchronize_session=False
    )
    db.query(PasswordResetToken).filter(
        PasswordResetToken.user_id == reset_token.user_id,
        PasswordResetToken.id != reset_token.id,
    ).delete(synchronize_session=False)
    db.commit()
    return {"message": "Password updated"}


@app.get("/me", response_model=UserRead)
def read_current_user(current_user: User = Depends(_get_current_user)):
    return UserRead.model_validate(current_user)


@app.put("/me", response_model=UserRead)
def update_current_user(
    payload: UserUpdate,
    csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
    session: SessionToken = Depends(_get_active_session),
    db: Session = Depends(get_db),
):
    _require_csrf(session, csrf_token)
    current_user = session.user
    if payload.username:
        # Check uniqueness
        if db.query(User).filter(User.username == payload.username, User.id != current_user.id).first():
            raise HTTPException(status_code=400, detail="Username already taken")
        current_user.username = payload.username
    if payload.email:
        # Check uniqueness
        if db.query(User).filter(User.email == payload.email, User.id != current_user.id).first():
            raise HTTPException(status_code=400, detail="Email already taken")
        current_user.email = payload.email
    if payload.password:
        if len(payload.password) < 8:
            raise HTTPException(status_code=400, detail="Password must be at least 8 characters")
        current_user.password_hash = pwd_context.hash(payload.password)
    
    db.commit()
    db.refresh(current_user)
    return UserRead.model_validate(current_user)


@app.get("/books", response_model=List[BookRead])
def list_books(current_user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    books = (
        db.query(Book)
        .filter(Book.user_id == current_user.id)
        .order_by(Book.updated_at.desc())
        .all()
    )
    response: List[BookRead] = []
    for book in books:
        response.append(
            BookRead(
                id=book.id,
                title=book.title,
                sector=book.sector,
                description=book.description,
                page_count=len(book.pages),
                updated_at=book.updated_at,
            )
        )
    return response


@app.post("/books", response_model=BookRead, status_code=201)
def create_book(
    payload: BookCreate,
    csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
    session: SessionToken = Depends(_get_active_session),
    db: Session = Depends(get_db),
):
    _require_csrf(session, csrf_token)
    current_user = session.user
    exists = (
        db.query(Book)
        .filter(Book.user_id == current_user.id, Book.title == payload.title)
        .first()
    )
    if exists:
        raise HTTPException(status_code=400, detail="Book title already exists")
    book = Book(
        title=payload.title,
        sector=payload.sector,
        description=payload.description,
        user_id=current_user.id,
    )
    db.add(book)
    db.commit()
    db.refresh(book)
    return BookRead(
        id=book.id,
        title=book.title,
        sector=book.sector,
        description=book.description,
        page_count=0,
        updated_at=book.updated_at,
    )


@app.get("/books/{book_id}", response_model=BookDetail)
def get_book(book_id: int, current_user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    book = _get_book_or_404(book_id, current_user, db)
    return BookDetail.model_validate(book)


@app.delete("/books/{book_id}")
def delete_book(
    book_id: int,
    csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
    session: SessionToken = Depends(_get_active_session),
    db: Session = Depends(get_db),
):
    _require_csrf(session, csrf_token)
    current_user = session.user
    book = _get_book_or_404(book_id, current_user, db)
    for page in book.pages:
        for image in page.images:
            _cleanup_image_file(image.file_path)
    db.delete(book)
    db.commit()
    return {"message": "Book deleted"}


@app.get("/books/{book_id}/pages", response_model=List[PageRead])
def list_pages(book_id: int, current_user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    _get_book_or_404(book_id, current_user, db)
    pages = db.query(Page).filter(Page.book_id == book_id).order_by(Page.created_at.desc()).all()
    return [PageRead.model_validate(page) for page in pages]


@app.get("/books/{book_id}/report.csv")
def export_book_csv(book_id: int, current_user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    book = _get_book_or_404(book_id, current_user, db)
    rows = [
        "title,note,cost,perk,timestamp,dimensions,images",
    ]
    for page in book.pages:
        title = page.title.replace("\n", " ").replace(",", ";")
        note = (page.note or "").replace("\n", " ").replace(",", ";")
        cost = "" if page.cost is None else f"{page.cost:.2f}"
        perk = (page.perk or "").replace("\n", " ").replace(",", ";")
        timestamp = page.page_timestamp.isoformat()
        dimensions = str(len(page.dimensions))
        images = str(len(page.images))
        rows.append(",".join([title, note, cost, perk, timestamp, dimensions, images]))
    content = "\n".join(rows)
    return Response(content=content, media_type="text/csv")


@app.post("/books/{book_id}/pages", response_model=PageRead, status_code=201)
async def create_page(
    book_id: int,
    title: str = Form(...),
    note: str = Form(""),
    cost: str = Form(""),
    perk: str = Form(""),
    page_timestamp: str = Form(""),
    images: Optional[List[UploadFile]] = File(None),
    csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
    session: SessionToken = Depends(_get_active_session),
    db: Session = Depends(get_db),
):
    _require_csrf(session, csrf_token)
    current_user = session.user
    _get_book_or_404(book_id, current_user, db)
    cost_value = float(cost) if cost not in (None, "") else None
    timestamp = _parse_timestamp(page_timestamp)
    page = Page(
        book_id=book_id,
        title=title,
        category="",
        note=note,
        cost=cost_value,
        perk=perk,
        page_timestamp=timestamp,
    )
    db.add(page)
    db.commit()
    db.refresh(page)
    await _attach_images(images, page, db)
    return _to_page_schema(page)


@app.put("/pages/{page_id}", response_model=PageRead)
async def update_page(
    page_id: int,
    title: str = Form(...),
    note: str = Form(""),
    cost: str = Form(""),
    perk: str = Form(""),
    page_timestamp: str = Form(""),
    images: Optional[List[UploadFile]] = File(None),
    csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
    session: SessionToken = Depends(_get_active_session),
    db: Session = Depends(get_db),
):
    _require_csrf(session, csrf_token)
    current_user = session.user
    page = _get_page_or_404(page_id, current_user, db)
    page.title = title
    page.category = page.category or ""
    page.note = note
    page.cost = float(cost) if cost not in (None, "") else None
    page.perk = perk
    if page_timestamp:
        page.page_timestamp = _parse_timestamp(page_timestamp)
    db.commit()
    await _attach_images(images, page, db)
    db.refresh(page)
    return _to_page_schema(page)


@app.delete("/pages/{page_id}")
def delete_page(
    page_id: int,
    csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
    session: SessionToken = Depends(_get_active_session),
    db: Session = Depends(get_db),
):
    _require_csrf(session, csrf_token)
    current_user = session.user
    page = _get_page_or_404(page_id, current_user, db)
    for image in page.images:
        _cleanup_image_file(image.file_path)
    db.delete(page)
    db.commit()
    return {"message": "Page deleted"}


@app.post("/pages/{page_id}/dimensions", response_model=PageRead)
def add_dimension_note(
    page_id: int,
    label: str = Form(""),
    value: str = Form(""),
    unit: str = Form(""),
    context: str = Form(""),
    csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
    session: SessionToken = Depends(_get_active_session),
    db: Session = Depends(get_db),
):
    _require_csrf(session, csrf_token)
    current_user = session.user
    page = _get_page_or_404(page_id, current_user, db)
    note = DimensionNote(
        page_id=page.id,
        label=label,
        value=value,
        unit=unit,
        context=context,
    )
    db.add(note)
    db.commit()
    db.refresh(page)
    return _to_page_schema(page)


@app.post("/images/{image_id}/markers")
def add_image_marker(
    image_id: int,
    x_percent: float = Form(...),
    y_percent: float = Form(...),
    label: str = Form(""),
    dimension_note_id: str = Form(""),
    csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
    session: SessionToken = Depends(_get_active_session),
    db: Session = Depends(get_db),
):
    _require_csrf(session, csrf_token)
    current_user = session.user
    image = _get_image_or_404(image_id, current_user, db)
    dimension_id_value = int(dimension_note_id) if dimension_note_id.isdigit() else None
    marker = ImageMarker(
        page_image_id=image.id,
        x_percent=x_percent,
        y_percent=y_percent,
        label=label,
        dimension_note_id=dimension_id_value,
    )
    db.add(marker)
    db.commit()
    return {"message": "Marker added"}


@app.delete("/images/{image_id}")
def delete_image(
    image_id: int,
    csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
    session: SessionToken = Depends(_get_active_session),
    db: Session = Depends(get_db),
):
    _require_csrf(session, csrf_token)
    current_user = session.user
    image = _get_image_or_404(image_id, current_user, db)
    _cleanup_image_file(image.file_path)
    db.delete(image)
    db.commit()
    return {"message": "Image deleted"}


@app.post("/reminders", response_model=ReminderRead, status_code=201)
def create_reminder(
    payload: ReminderCreate,
    csrf_token: Optional[str] = Header(None, alias="X-CSRF-Token"),
    session: SessionToken = Depends(_get_active_session),
    db: Session = Depends(get_db),
):
    _require_csrf(session, csrf_token)
    current_user = session.user
    if payload.page_id:
        _get_page_or_404(payload.page_id, current_user, db)
    reminder = Reminder(
        user_id=current_user.id,
        page_id=payload.page_id,
        title=payload.title,
        remind_at=payload.remind_at,
    )
    db.add(reminder)
    db.commit()
    db.refresh(reminder)
    return ReminderRead.model_validate(reminder)


@app.get("/dashboard", response_model=DashboardStats)
def dashboard(current_user: User = Depends(_get_current_user), db: Session = Depends(get_db)):
    books = db.query(Book).filter(Book.user_id == current_user.id).order_by(Book.updated_at.desc()).all()
    pages = db.query(Page).join(Book).filter(Book.user_id == current_user.id).all()
    upcoming = (
        db.query(Reminder)
        .filter(Reminder.user_id == current_user.id, Reminder.remind_at >= datetime.now(timezone.utc))
        .order_by(Reminder.remind_at.asc())
        .limit(5)
        .all()
    )
    latest_book = books[0] if books else None
    latest_page = pages[-1] if pages else None
    return DashboardStats(
        books=len(books),
        pages=len(pages),
        latest_book_title=latest_book.title if latest_book else None,
        latest_page_title=latest_page.title if latest_page else None,
        upcoming_reminders=[ReminderRead.model_validate(item) for item in upcoming],
    )
