"""Provider types available to config/ai.json. Add a new kind of AI by writing a Provider subclass and listing it here."""
from .rules import RulesProvider
from .claude import ClaudeProvider
from .others import GeminiProvider, OllamaProvider, HttpModelProvider, GroqWhisperProvider, GroqChatProvider, LocalWhisperProvider
from .web_free import WebSearchFreeProvider

TYPES = {
    'rules': RulesProvider,
    'claude': ClaudeProvider,
    'gemini': GeminiProvider,
    'ollama': OllamaProvider,
    'http': HttpModelProvider,
    'groq_whisper': GroqWhisperProvider,
    'groq_chat': GroqChatProvider,
    'local_whisper': LocalWhisperProvider,
    'web_search_free': WebSearchFreeProvider,
}
