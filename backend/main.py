from __future__ import annotations

from pathlib import Path
from typing import List, Optional
from uuid import uuid4

from fastapi import Depends, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from sqlalchemy.orm import Session

from .database import Base, engine, get_db
from .models import Category, Entry, EntryImage
from .schemas import (
    CategoryCreate,
    CategoryDetail,
    CategoryRead,
    EntryImageRead,
    EntryRead,
)

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(parents=True, exist_ok=True)

Base.metadata.create_all(bind=engine)

app = FastAPI(title="Architecture Notes API", version="1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.mount("/uploads", StaticFiles(directory=UPLOAD_DIR), name="uploads")


def _to_entry_schema(entry: Entry) -> EntryRead:
    image_payload = [
        EntryImageRead(id=image.id, file_path=f"/{image.file_path}") for image in entry.images
    ]
    return EntryRead(
        id=entry.id,
        category_id=entry.category_id,
        item_type=entry.item_type,
        name=entry.name,
        dimensions=entry.dimensions or "",
        price=entry.price,
        notes=entry.notes or "",
        images=image_payload,
    )


def _cleanup_image_file(file_path: str) -> None:
    full_path = BASE_DIR / file_path
    if full_path.exists():
        full_path.unlink()


async def _attach_images(
    files: Optional[List[UploadFile]],
    entry: Entry,
    db: Session,
) -> None:
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
        db_image = EntryImage(entry_id=entry.id, file_path=relative_path)
        db.add(db_image)
    db.commit()
    db.refresh(entry)


@app.get("/")
def healthcheck():
    return {"message": "Architecture Notes API is running"}


@app.get("/categories", response_model=List[CategoryRead])
def list_categories(db: Session = Depends(get_db)):
    categories = db.query(Category).all()
    response: List[CategoryRead] = []
    for category in categories:
        response.append(
            CategoryRead(id=category.id, name=category.name, entry_count=len(category.entries))
        )
    return response


@app.post("/categories", response_model=CategoryRead, status_code=201)
def create_category(payload: CategoryCreate, db: Session = Depends(get_db)):
    name_exists = db.query(Category).filter(Category.name == payload.name).first()
    if name_exists:
        raise HTTPException(status_code=400, detail="Category name already exists")
    category = Category(name=payload.name)
    db.add(category)
    db.commit()
    db.refresh(category)
    return CategoryRead(id=category.id, name=category.name, entry_count=0)


@app.get("/categories/{category_id}", response_model=CategoryDetail)
def get_category(category_id: int, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    entries = [_to_entry_schema(entry) for entry in category.entries]
    return CategoryDetail(id=category.id, name=category.name, entries=entries)


@app.delete("/categories/{category_id}")
def delete_category(category_id: int, db: Session = Depends(get_db)):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    for entry in category.entries:
        for image in entry.images:
            _cleanup_image_file(image.file_path)
    db.delete(category)
    db.commit()
    return {"message": "Category deleted"}


@app.get("/categories/{category_id}/entries", response_model=List[EntryRead])
def list_entries(category_id: int, db: Session = Depends(get_db)):
    entries = (
        db.query(Entry)
        .filter(Entry.category_id == category_id)
        .order_by(Entry.id.desc())
        .all()
    )
    return [_to_entry_schema(entry) for entry in entries]


@app.post("/categories/{category_id}/entries", response_model=EntryRead, status_code=201)
async def create_entry(
    category_id: int,
    item_type: str = Form(...),
    name: str = Form(...),
    dimensions: str = Form(""),
    price: str = Form(""),
    notes: str = Form(""),
    images: Optional[List[UploadFile]] = File(None),
    db: Session = Depends(get_db),
):
    category = db.query(Category).filter(Category.id == category_id).first()
    if not category:
        raise HTTPException(status_code=404, detail="Category not found")
    price_value = float(price) if price not in (None, "") else None
    entry = Entry(
        category_id=category_id,
        item_type=item_type,
        name=name,
        dimensions=dimensions,
        price=price_value,
        notes=notes,
    )
    db.add(entry)
    db.commit()
    db.refresh(entry)
    await _attach_images(images, entry, db)
    return _to_entry_schema(entry)


@app.put("/entries/{entry_id}", response_model=EntryRead)
async def update_entry(
    entry_id: int,
    item_type: str = Form(...),
    name: str = Form(...),
    dimensions: str = Form(""),
    price: str = Form(""),
    notes: str = Form(""),
    images: Optional[List[UploadFile]] = File(None),
    remove_image_ids: str = Form(""),
    db: Session = Depends(get_db),
):
    entry = db.query(Entry).filter(Entry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")

    entry.item_type = item_type
    entry.name = name
    entry.dimensions = dimensions
    entry.price = float(price) if price not in (None, "") else None
    entry.notes = notes

    if remove_image_ids:
        ids = [int(value) for value in remove_image_ids.split(",") if value.strip().isdigit()]
        for image in list(entry.images):
            if image.id in ids:
                _cleanup_image_file(image.file_path)
                db.delete(image)

    db.commit()
    await _attach_images(images, entry, db)
    db.refresh(entry)
    return _to_entry_schema(entry)


@app.delete("/entries/{entry_id}")
def delete_entry(entry_id: int, db: Session = Depends(get_db)):
    entry = db.query(Entry).filter(Entry.id == entry_id).first()
    if not entry:
        raise HTTPException(status_code=404, detail="Entry not found")
    for image in entry.images:
        _cleanup_image_file(image.file_path)
    db.delete(entry)
    db.commit()
    return {"message": "Entry deleted"}


@app.delete("/images/{image_id}")
def delete_image(image_id: int, db: Session = Depends(get_db)):
    image = db.query(EntryImage).filter(EntryImage.id == image_id).first()
    if not image:
        raise HTTPException(status_code=404, detail="Image not found")
    _cleanup_image_file(image.file_path)
    db.delete(image)
    db.commit()
    return {"message": "Image deleted"}
