document.addEventListener("DOMContentLoaded", async () => {
  const output = document.getElementById("idOutput");
  const status = document.getElementById("status");
  const details = document.getElementById("details");
  const copyBtn = document.getElementById("copyBtn");

  startScan();

  async function startScan() {
    try {
      status.textContent = "Scanning...";
      const tabs = await browser.tabs.query({ active: true, currentWindow: true });
      const activeTab = tabs[0];

      let data = { trusted: [], candidates: [] };
      
      try {
        data = await browser.tabs.sendMessage(activeTab.id, { action: "scan_page" });
      } catch (e) {
        // Inject script if missing
        await browser.scripting.executeScript({ target: { tabId: activeTab.id }, files: ["content.js"] });
        data = await browser.tabs.sendMessage(activeTab.id, { action: "scan_page" });
      }

      const trusted = data.trusted || [];
      const candidates = data.candidates || [];
      const validFromCandidates = [];

      // 1. Process Trusted (Instant)
      let allIds = [...trusted];
      status.innerHTML = `Found <b style="color:green">${trusted.length}</b> linked IDs...`;

      // 2. Validate Candidates (If any)
      if (candidates.length > 0) {
        status.innerHTML += `<br>Validating ${candidates.length} other numbers...`;
        
        // Batch process candidates to avoid freezing
        const batchSize = 5;
        for (let i = 0; i < candidates.length; i += batchSize) {
          const batch = candidates.slice(i, i + batchSize);
          
          details.textContent = `API Check: ${i}/${candidates.length}`;
          
          const results = await Promise.all(batch.map(checkUsfcApi));
          results.forEach(id => { if (id) validFromCandidates.push(id); });
        }
      }

      // 3. Merge
      allIds = [...allIds, ...validFromCandidates];
      
      // Deduplicate
      allIds = [...new Set(allIds)];

      // 4. Final Output
      if (allIds.length > 0) {
        status.innerHTML = `Done! Found <b style="color:green">${allIds.length}</b> unique IDs.`;
        details.textContent = `(Links: ${trusted.length} | Text Scan: ${validFromCandidates.length})`;
        output.value = allIds.join(", ");
        copyBtn.disabled = false;
        copyBtn.textContent = "Copy to Clipboard";
      } else {
        status.textContent = "No IDs found.";
        details.textContent = "Try scrolling down or expanding the table.";
      }

    } catch (err) {
      console.error(err);
      status.textContent = "Error: " + err.message;
    }
  }

  // Returns ID if valid, null otherwise
  async function checkUsfcApi(id) {
    // Skip obvious dates (e.g. 202xxxxx) to save API calls
    if (id.startsWith("202") || id.startsWith("199")) return null; 

    const url = `https://ratings-api.uschess.org/api/v1/members/${id}`;
    try {
      const resp = await fetch(url);
      if (resp.ok) {
        const data = await resp.json();
        return data.id ? id : null;
      }
    } catch (e) {}
    return null;
  }

  copyBtn.addEventListener("click", () => {
    output.select();
    navigator.clipboard.writeText(output.value);
    copyBtn.textContent = "Copied!";
    setTimeout(() => copyBtn.textContent = "Copy", 2000);
  });
});
