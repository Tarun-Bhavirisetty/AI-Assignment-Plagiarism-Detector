from abc import ABC, abstractmethod
from typing import List, Optional


class SearchResult:
    def __init__(
        self,
        title: str,
        url: str,
        snippet: str,
        published_date: Optional[str] = None,
        domain: Optional[str] = None,
    ):
        self.title = title
        self.url = url
        self.snippet = snippet
        self.published_date = published_date
        self.domain = domain

    def to_dict(self) -> dict:
        return {
            "title": self.title,
            "url": self.url,
            "snippet": self.snippet,
            "published_date": self.published_date,
            "domain": self.domain,
        }


class BaseSearchProvider(ABC):
    @abstractmethod
    def search(self, query: str, max_results: int = 5) -> List[SearchResult]:
        ...

    @abstractmethod
    def is_available(self) -> bool:
        ...
