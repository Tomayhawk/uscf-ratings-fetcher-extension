browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan_page") {
    const results = scanPage();
    sendResponse(results);
  }
});

function scanPage() {
  const trustedIds = new Set();
  const candidates = new Set();

  // Look for links pointing to US Chess player profiles
  const links = document.querySelectorAll("a[href*='uschess.org/player'], a[href*='ratings-api.uschess.org']");
  links.forEach(a => {
    const href = a.href;
    // Extract 8-digit ID from URL
    const match = href.match(/(\d{8})/);
    if (match) {
      trustedIds.add(match[1]);
    }
  });

  // Look for any 8-digit number in the visible text
  // We exclude numbers that are already in trustedIds
  const text = document.body.innerText;
  const regex = /\b\d{8}\b/g;
  const textMatches = text.match(regex);

  if (textMatches) {
    textMatches.forEach(id => {
      if (!trustedIds.has(id)) {
        candidates.add(id);
      }
    });
  }

  return {
    trusted: Array.from(trustedIds),
    candidates: Array.from(candidates)
  };
}
