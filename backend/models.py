from sqlalchemy import Column, Float, ForeignKey, Integer, String, Text
from sqlalchemy.orm import relationship

from .database import Base


class Category(Base):
    __tablename__ = "categories"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), unique=True, nullable=False)

    entries = relationship(
        "Entry",
        back_populates="category",
        cascade="all, delete-orphan",
        order_by="Entry.id",
    )


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
