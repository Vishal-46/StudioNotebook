from sqlalchemy import Column, DateTime, Float, ForeignKey, Integer, String, Text, UniqueConstraint
from sqlalchemy.orm import relationship
from sqlalchemy.sql import func

from .database import Base


class User(Base):
    __tablename__ = "users"

    id = Column(Integer, primary_key=True, index=True)
    username = Column(String(80), unique=True, nullable=False)
    password_hash = Column(String(255), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    categories = relationship(
        "Category",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="Category.id",
    )
    tokens = relationship(
        "SessionToken",
        back_populates="user",
        cascade="all, delete-orphan",
        order_by="SessionToken.created_at",
    )


class SessionToken(Base):
    __tablename__ = "session_tokens"

    id = Column(Integer, primary_key=True, index=True)
    token = Column(String(64), unique=True, nullable=False, index=True)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="tokens")


class Category(Base):
    __tablename__ = "categories"
    __table_args__ = (UniqueConstraint("user_id", "name", name="uq_category_user_name"),)

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)
    user_id = Column(Integer, ForeignKey("users.id"), nullable=False)

    entries = relationship(
        "Entry",
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="Entry.id",
    )
    user = relationship("User", back_populates="categories")


class Entry(Base):
    __tablename__ = "entries"

    id = Column(Integer, primary_key=True, index=True)
    category_id = Column(Integer, ForeignKey("categories.id"), nullable=False)
    item_type = Column(String(100), nullable=False)
    name = Column(String(150), nullable=False)
    dimensions = Column(String(150), default="")
    price = Column(Float, nullable=True)
    notes = Column(Text, default="")

    category = relationship("Category", back_populates="entries")
    images = relationship(
        "EntryImage",
        back_populates="entry",
        cascade="all, delete-orphan",
        order_by="EntryImage.id",
    )


class EntryImage(Base):
    __tablename__ = "entry_images"

    id = Column(Integer, primary_key=True, index=True)
    entry_id = Column(Integer, ForeignKey("entries.id"), nullable=False)
    file_path = Column(String(255), nullable=False)

    entry = relationship("Entry", back_populates="images")
