import os
from dotenv import load_dotenv

load_dotenv()

LINEAR_API_KEY = os.getenv("LINEAR_API_KEY", "")
LINEAR_TEAM_ID = os.getenv("LINEAR_TEAM_ID", "")
