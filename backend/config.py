from pydantic_settings import BaseSettings

class Settings(BaseSettings):
    # App Settings
    DATABASE_URL: str = "sqlite:///./notes.db"
    
    # Supabase (Optional for local dev)
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""
    
    # Mail Settings
    MAIL_USERNAME: str = ""
    MAIL_PASSWORD: str = ""
    MAIL_FROM: str = ""
    MAIL_PORT: int = 587
    MAIL_SERVER: str = "smtp.gmail.com"
    MAIL_STARTTLS: bool = True
    MAIL_SSL_TLS: bool = False
    USE_CREDENTIALS: bool = True
    VALIDATE_CERTS: bool = True

    class Config:
        env_file = "backend/.env"

settings = Settings()
