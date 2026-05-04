from datetime import datetime
from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class UserBase(BaseModel):
    username: str
    email: str


class UserUpdate(BaseModel):
    username: Optional[str] = None
    email: Optional[str] = None
    password: Optional[str] = None


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class SignupRequest(UserBase):
    password: str


class LoginRequest(BaseModel):
    username_or_email: str
    password: str


class AuthResponse(BaseModel):
    user: UserRead
    csrf_token: str


class PasswordResetRequest(BaseModel):
    email: str


class PasswordResetConfirm(BaseModel):
    token: str
    password: str


class DimensionNoteRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    label: Optional[str] = None
    value: Optional[str] = None
    unit: Optional[str] = None
    context: Optional[str] = None
    created_at: datetime


class ImageMarkerRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    page_image_id: int
    x_percent: float
    y_percent: float
    label: Optional[str] = None
    dimension_note_id: Optional[int] = None
    created_at: datetime


class PageImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_path: str
    caption: Optional[str] = None
    markers: List[ImageMarkerRead] = Field(default_factory=list)


class PageBase(BaseModel):
    title: str
    category: Optional[str] = None
    note: Optional[str] = None
    cost: Optional[float] = None
    perk: Optional[str] = None
    page_timestamp: Optional[datetime] = None


class PageRead(PageBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    book_id: int
    images: List[PageImageRead] = Field(default_factory=list)
    dimensions: List[DimensionNoteRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime
    page_timestamp: datetime


class PageUpdate(BaseModel):
    title: str
    category: Optional[str] = None
    note: Optional[str] = None
    cost: Optional[float] = None
    perk: Optional[str] = None
    page_timestamp: Optional[datetime] = None


class BookBase(BaseModel):
    title: str
    sector: Optional[str] = None
    description: Optional[str] = None


class BookCreate(BookBase):
    pass


class BookRead(BookBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    page_count: int = 0
    updated_at: datetime


class BookDetail(BookBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    pages: List[PageRead] = Field(default_factory=list)


class ReminderRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    page_id: Optional[int] = None
    title: str
    remind_at: datetime
    delivered_at: Optional[datetime] = None


class ReminderCreate(BaseModel):
    page_id: Optional[int] = None
    title: str
    remind_at: datetime


class DashboardStats(BaseModel):
    books: int
    pages: int
    latest_book_title: Optional[str] = None
    latest_page_title: Optional[str] = None
    upcoming_reminders: List[ReminderRead] = Field(default_factory=list)
