from sqlalchemy import create_engine
from sqlalchemy.orm import declarative_base, sessionmaker
from .config import settings

# If SUPABASE_URL is provided, use it (PostgreSQL). Otherwise fallback to SQLite.
if settings.SUPABASE_URL and "postgresql" in settings.DATABASE_URL:
    DATABASE_URL = settings.DATABASE_URL
    connect_args = {}
else:
    DATABASE_URL = "sqlite:///./notes.db"
    connect_args = {"check_same_thread": False}

engine = create_engine(
    DATABASE_URL,
    connect_args=connect_args,
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)
Base = declarative_base()


def get_db():
    """Provide a database session for each request."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
