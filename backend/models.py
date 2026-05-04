from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(80), unique=True, nullable=False)
    email = Column(String(190), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    books = relationship(
        "Book",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="Book.created_at",
    )
    tokens = relationship(
        "SessionToken",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="SessionToken.created_at",
    )
    reset_tokens = relationship(
        "PasswordResetToken",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="PasswordResetToken.created_at",
    )
    reminders = relationship(
        "Reminder",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="Reminder.remind_at",
    )


class SessionToken(Base):
    __tablename__ = "session_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    csrf_token = Column(String(64), nullable=False)

    user = relationship("User", back_populates="tokens")


class PasswordResetToken(Base):
    __tablename__ = "password_reset_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    expires_at = Column(DateTime(timezone=True), nullable=False)
    used_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="reset_tokens")


class Book(Base):
    __tablename__ = "books"
    __table_args__ = (UniqueConstraint("user_id", "title", name="uq_book_user_title"),)

    id = Column(Integer, primary_key=True, index=True)
    title = Column(String(140), nullable=False)
    sector = Column(String(140), nullable=True)
    description = Column(Text, nullable=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    pages = relationship(
        "Page",
        back_populates="book",
        cascade="all, delete-orphan",
        order_by="Page.created_at",
    )
    user = relationship("User", back_populates="books")


class Page(Base):
    __tablename__ = "pages"

    id = Column(Integer, primary_key=True, index=True)
    book_id = Column(Integer, ForeignKey("books.id"), nullable=False)
    title = Column(String(160), nullable=False)
    category = Column(String(140), nullable=True)
    note = Column(Text, nullable=True)
    cost = Column(Float, nullable=True)
    perk = Column(String(200), nullable=True)
    page_timestamp = Column(DateTime(timezone=True), server_default=func.now())
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())

    book = relationship("Book", back_populates="pages")
    images = relationship(
        "PageImage",
        back_populates="page",
        cascade="all, delete-orphan",
        order_by="PageImage.id",
    )
    dimensions = relationship(
        "DimensionNote",
        back_populates="page",
        cascade="all, delete-orphan",
        order_by="DimensionNote.created_at",
    )
    reminders = relationship(
        "Reminder",
        back_populates="page",
        cascade="all, delete-orphan",
        order_by="Reminder.remind_at",
    )


class PageImage(Base):
    __tablename__ = "page_images"

    id = Column(Integer, primary_key=True, index=True)
    page_id = Column(Integer, ForeignKey("pages.id"), nullable=False)
    file_path = Column(String(255), nullable=False)
    caption = Column(String(200), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    page = relationship("Page", back_populates="images")
    markers = relationship(
        "ImageMarker",
        back_populates="image",
        cascade="all, delete-orphan",
        order_by="ImageMarker.id",
    )


class DimensionNote(Base):
    __tablename__ = "dimension_notes"

    id = Column(Integer, primary_key=True, index=True)
    page_id = Column(Integer, ForeignKey("pages.id"), nullable=False)
    label = Column(String(140), nullable=True)
    value = Column(String(50), nullable=True)
    unit = Column(String(20), nullable=True)
    context = Column(String(255), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    page = relationship("Page", back_populates="dimensions")
    markers = relationship("ImageMarker", back_populates="dimension_note")


class ImageMarker(Base):
    __tablename__ = "image_markers"

    id = Column(Integer, primary_key=True, index=True)
    page_image_id = Column(Integer, ForeignKey("page_images.id"), nullable=False)
    x_percent = Column(Float, nullable=False)
    y_percent = Column(Float, nullable=False)
    label = Column(String(140), nullable=True)
    dimension_note_id = Column(Integer, ForeignKey("dimension_notes.id"), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    image = relationship("PageImage", back_populates="markers")
    dimension_note = relationship("DimensionNote", back_populates="markers")


class Reminder(Base):
    __tablename__ = "reminders"

    id = Column(Integer, primary_key=True, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    page_id = Column(Integer, ForeignKey("pages.id"), nullable=True)
    title = Column(String(200), nullable=False)
    remind_at = Column(DateTime(timezone=True), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    delivered_at = Column(DateTime(timezone=True), nullable=True)

    user = relationship("User", back_populates="reminders")
    page = relationship("Page", back_populates="reminders")
