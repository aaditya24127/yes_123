"""The app's only door to AI. Features call ai.run('<task>', input) and never name a provider or model.
Who answers each task is decided in config/ai.json (see the _readme there)."""
from .registry import run, status, config, test_all, Attachment, Result, AIUnavailable, AIError, Unsupported
from .tasks import TASKS, knowledge
