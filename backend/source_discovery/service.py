import os
from sqlalchemy.orm import Session

import models
from source_discovery.passage_selector import select_passages
from source_discovery.providers.tavily import (
    TavilyProvider,
    TavilyError,
    TavilyQuotaExhaustedError,
    TavilyAuthError,
    TavilyConnectionError,
)
from source_discovery.analyzer import analyze_match

MAX_QUERIES = int(os.getenv("SOURCE_DISCOVERY_MAX_QUERIES", "5"))
MAX_RESULTS_PER_QUERY = int(os.getenv("SOURCE_DISCOVERY_MAX_RESULTS", "5"))


def _serialize_results(results) -> list:
    out = []
    for r in results:
        out.append({
            "id": r.id,
            "source_url": r.source_url,
            "source_title": r.source_title,
            "source_domain": r.source_domain,
            "matched_assignment_excerpt": r.matched_assignment_excerpt,
            "matched_source_excerpt": r.matched_source_excerpt,
            "match_method": r.match_method,
            "similarity_score": r.similarity_score,
            "source_published_date": r.source_published_date,
            "searched_at": r.searched_at.isoformat() if r.searched_at else None,
        })
    return out


def run_source_discovery(upload_id: int, db: Session, force_refresh: bool = False, provider=None) -> dict:
    upload = db.query(models.Upload).filter(models.Upload.id == upload_id).first()
    if not upload:
        return {"status": "error", "message": "Upload not found", "job_id": None, "results": []}

    if provider is None:
        provider = TavilyProvider()

    if not provider.is_available():
        return {
            "status": "unavailable",
            "message": "TAVILY_API_KEY is not configured. Online source discovery is disabled.",
            "job_id": None,
            "results": [],
        }

    # Return cached completed job (unless force_refresh)
    if not force_refresh:
        existing = (
            db.query(models.OnlineSourceJob)
            .filter(
                models.OnlineSourceJob.upload_id == upload_id,
                models.OnlineSourceJob.status == "completed",
            )
            .order_by(models.OnlineSourceJob.created_at.desc())
            .first()
        )
        if existing:
            results = (
                db.query(models.OnlineSourceResult)
                .filter(models.OnlineSourceResult.job_id == existing.id)
                .all()
            )
            return {
                "status": "completed",
                "job_id": existing.id,
                "queries_sent": existing.queries_sent,
                "created_at": existing.created_at.isoformat() if existing.created_at else None,
                "results": _serialize_results(results),
            }

    # If a job is already running, return its status
    running = (
        db.query(models.OnlineSourceJob)
        .filter(
            models.OnlineSourceJob.upload_id == upload_id,
            models.OnlineSourceJob.status.in_(["pending", "processing"]),
        )
        .first()
    )
    if running:
        return {
            "status": running.status,
            "job_id": running.id,
            "message": "Analysis in progress",
            "results": [],
        }

    # Create new job
    job = models.OnlineSourceJob(upload_id=upload_id, status="processing")
    db.add(job)
    db.commit()
    db.refresh(job)

    try:
        text = upload.extracted_text or ""
        if not text.strip():
            job.status = "failed"
            job.error_message = "No extracted text available for this submission"
            db.commit()
            return {"status": "failed", "message": "No text to search", "job_id": job.id, "results": []}

        passages = select_passages(text, max_count=MAX_QUERIES)
        if not passages:
            job.status = "completed"
            job.queries_sent = 0
            db.commit()
            return {
                "status": "completed",
                "job_id": job.id,
                "results": [],
                "queries_sent": 0,
                "created_at": job.created_at.isoformat() if job.created_at else None,
                "message": "No suitable passages found for search",
            }

        seen_urls: set = set()
        result_records = []

        for passage in passages:
            sr_list = provider.search(passage, max_results=MAX_RESULTS_PER_QUERY)
            job.queries_sent = (job.queries_sent or 0) + 1
            db.commit()

            for sr in sr_list:
                if sr.url in seen_urls:
                    continue
                seen_urls.add(sr.url)

                match_info = analyze_match(passage, text, sr)
                rec = models.OnlineSourceResult(
                    job_id=job.id,
                    upload_id=upload_id,
                    source_url=sr.url,
                    source_title=sr.title,
                    source_domain=sr.domain,
                    matched_assignment_excerpt=match_info.get("assignment_excerpt"),
                    matched_source_excerpt=match_info.get("source_excerpt"),
                    match_method=match_info.get("method"),
                    similarity_score=match_info.get("score"),
                    source_published_date=sr.published_date,
                )
                db.add(rec)
                result_records.append(rec)

        db.commit()
        for rec in result_records:
            db.refresh(rec)

        job.status = "completed"
        db.commit()
        db.refresh(job)

        return {
            "status": "completed",
            "job_id": job.id,
            "queries_sent": job.queries_sent,
            "created_at": job.created_at.isoformat() if job.created_at else None,
            "results": _serialize_results(result_records),
        }

    except TavilyQuotaExhaustedError as e:
        job.status = "failed"
        job.error_message = "Search quota exhausted. Tavily monthly limit reached."
        db.commit()
        return {"status": "failed", "message": job.error_message, "job_id": job.id, "results": []}

    except TavilyAuthError as e:
        job.status = "failed"
        job.error_message = "Authentication failed. Invalid or expired Tavily API key."
        db.commit()
        return {"status": "failed", "message": job.error_message, "job_id": job.id, "results": []}

    except TavilyConnectionError as e:
        job.status = "failed"
        job.error_message = f"Search service temporarily unreachable: {str(e)[:150]}"
        db.commit()
        return {"status": "failed", "message": job.error_message, "job_id": job.id, "results": []}

    except Exception as e:
        job.status = "failed"
        job.error_message = str(e)[:500]
        db.commit()
        return {"status": "failed", "message": str(e)[:200], "job_id": job.id, "results": []}
