"""Select an available Chromium for local and GitHub Actions QA runs."""
import os
import shutil


def launch_chromium(p):
    candidates = [os.environ.get('CHROMIUM_PATH')]
    candidates.extend(shutil.which(name) for name in (
        'chromium', 'chromium-browser', 'google-chrome', 'google-chrome-stable'
    ))
    for executable in candidates:
        if executable:
            return p.chromium.launch(executable_path=executable,
                                     headless=True, args=['--no-sandbox','--disable-dev-shm-usage'])
    # Requires `python -m playwright install chromium` when no system browser exists.
    return p.chromium.launch(headless=True,
                             args=['--no-sandbox','--disable-dev-shm-usage'])
