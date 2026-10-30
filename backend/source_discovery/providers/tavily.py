import os
from urllib.parse import urlparse
from typing import List, Optional

import httpx

from .base import BaseSearchProvider, SearchResult

TAVILY_ENDPOINT = "https://api.tavily.com/search"


class TavilyError(Exception):
    """Base exception for Tavily search provider."""
    pass


class TavilyQuotaExhaustedError(TavilyError):
    """Raised when Tavily monthly credit limit / rate limit is reached."""
    pass


class TavilyAuthError(TavilyError):
    """Raised when API key is invalid or unauthorized."""
    pass


class TavilyConnectionError(TavilyError):
    """Raised on connection timeout or network failure."""
    pass


class TavilyProvider(BaseSearchProvider):
    def is_available(self) -> bool:
        return bool(os.getenv("TAVILY_API_KEY", "").strip())

    def search(self, query: str, max_results: int = 5, timeout: int = 15) -> List[SearchResult]:
        api_key = os.getenv("TAVILY_API_KEY", "").strip()
        if not api_key:
            return []

        try:
            resp = httpx.post(
                TAVILY_ENDPOINT,
                json={
                    "api_key": api_key,
                    "query": query,
                    "max_results": max_results,
                    "search_depth": "basic",
                },
                timeout=timeout,
            )

            if resp.status_code == 429:
                raise TavilyQuotaExhaustedError("Tavily API quota or rate limit exceeded.")
            elif resp.status_code in (401, 403):
                raise TavilyAuthError("Tavily API authentication failed. Please check your TAVILY_API_KEY.")
            elif resp.status_code >= 500:
                raise TavilyError(f"Tavily server error ({resp.status_code}).")

            resp.raise_for_status()
            data = resp.json()
            results = []
            for r in data.get("results", []):
                url = r.get("url", "")
                if not url or not url.startswith("http"):
                    continue
                domain = urlparse(url).netloc
                results.append(
                    SearchResult(
                        title=r.get("title", ""),
                        url=url,
                        snippet=r.get("content", ""),
                        published_date=r.get("published_date"),
                        domain=domain,
                    )
                )
            return results

        except (TavilyQuotaExhaustedError, TavilyAuthError) as e:
            raise e
        except httpx.TimeoutException as e:
            raise TavilyConnectionError(f"Tavily search timed out after {timeout}s: {e}")
        except httpx.NetworkError as e:
            raise TavilyConnectionError(f"Network error contacting Tavily: {e}")
        except Exception as e:
            if isinstance(e, TavilyError):
                raise e
            raise TavilyError(f"Unexpected search error: {e}")
