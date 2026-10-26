import os
from dotenv import load_dotenv

# Load .env file
load_dotenv(os.path.join(os.path.dirname(__file__), '.env'))

class Config:
    DB_SERVER = os.getenv('DB_SERVER', '10.5.3.3')
    DB_PORT = int(os.getenv('DB_PORT', 1433))
    DB_USER = os.getenv('DB_USER', 'bhuser')
    DB_PASSWORD = os.getenv('DB_PASSWORD', 'bhold')
    DB_DATABASE = os.getenv('DB_DATABASE', 'hrmbhsql')
    
    FLASK_HOST = os.getenv('FLASK_HOST', '0.0.0.0')
    FLASK_PORT = int(os.getenv('FLASK_PORT', 5030))
    SECRET_KEY = os.getenv('SECRET_KEY', 'default_dev_secret_key_change_in_prod')
