from typing import List, Optional

from pydantic import BaseModel, ConfigDict, Field


class UserBase(BaseModel):
    username: str


class UserRead(UserBase):
    model_config = ConfigDict(from_attributes=True)

    id: int


class SignupRequest(UserBase):
    password: str


class LoginRequest(BaseModel):
    username: str
    password: str


class AuthResponse(BaseModel):
    token: str
    user: UserRead


class EntryImageRead(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: int
    file_path: str


class EntryBase(BaseModel):
    item_type: str
    name: str
    dimensions: Optional[str] = ""
    price: Optional[float] = None
    notes: Optional[str] = ""


class EntryRead(EntryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    category_id: int
    images: List[EntryImageRead] = Field(default_factory=list)


class EntryUpdate(BaseModel):
    item_type: str
    name: str
    dimensions: Optional[str] = ""
    price: Optional[float] = None
    notes: Optional[str] = ""


class CategoryBase(BaseModel):
    name: str


class CategoryCreate(CategoryBase):
    pass


class CategoryRead(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entry_count: int = 0


class CategoryDetail(CategoryBase):
    model_config = ConfigDict(from_attributes=True)

    id: int
    entries: List[EntryRead] = Field(default_factory=list)
