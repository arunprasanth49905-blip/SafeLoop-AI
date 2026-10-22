"""Centralized logging configuration for SafeLoop AI."""

import logging
import sys


def setup_logging(debug: bool = False) -> logging.Logger:
    """Configure and return the root logger without exposing secrets."""
    log_level = logging.DEBUG if debug else logging.INFO

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)-7s | %(name)s:%(lineno)d - %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    handler = logging.StreamHandler(sys.stdout)
    handler.setFormatter(formatter)

    logger = logging.getLogger("safeloop")
    logger.setLevel(log_level)

    # Avoid duplicate handlers if setup is called multiple times
    if not logger.handlers:
        logger.addHandler(handler)

    return logger


logger = setup_logging()
