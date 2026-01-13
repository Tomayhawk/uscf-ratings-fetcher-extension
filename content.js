browser.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scrape_entries") {
    sendResponse({ players: scrapeTable() });
  }
});

function scrapeTable() {
  const table = document.getElementById("reg-list");
  if (!table) return [];
  const rows = table.querySelectorAll("tbody tr");
  const extractedData = [];
  rows.forEach(row => {
    const cols = row.querySelectorAll("td");
    if (cols.length > 2) {
      const uscfId = cols[1].innerText.trim();
      const name = cols[2].innerText.trim();
      if (uscfId && name && /^\d+$/.test(uscfId)) {
        extractedData.push({ uscfId, name });
      }
    }
  });
  return extractedData;
}
