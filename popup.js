document.getElementById("downloadBtn").addEventListener("click", async () => {
  const statusDiv = document.getElementById("status");
  statusDiv.innerHTML = "Initializing...";
  statusDiv.className = "";

  try {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const activeTab = tabs[0];

    // STEP 1: Try to get players. If it fails, inject script and try again.
    let players = [];
    try {
      const response = await browser.tabs.sendMessage(activeTab.id, { action: "scrape_entries" });
      players = response.players;
    } catch (error) {
      // If error is "Could not establish connection", script is missing. Inject it now.
      console.log("Script not found. Injecting manually...", error);
      statusDiv.innerHTML = "Injecting script... (one moment)";
      
      await browser.scripting.executeScript({
        target: { tabId: activeTab.id },
        files: ["content.js"]
      });

      // Try sending message again after injection
      const response = await browser.tabs.sendMessage(activeTab.id, { action: "scrape_entries" });
      players = response.players;
    }

    if (!players || players.length === 0) {
      throw new Error("No players found. Check if you are on the Entries page.");
    }

    // STEP 2: Start Processing
    const total = players.length;
    statusDiv.innerHTML = `Found ${total} players.<br>Starting Deep Search...`;

    const enrichedPlayers = [];
    for (let i = 0; i < total; i++) {
      const p = players[i];
      
      // Update UI
      statusDiv.innerHTML = `Processing ${i + 1}/${total}: <b>${p.name}</b><br><span class="progress">Fetching live history...</span>`;
      
      // Get Ratings
      const ratings = await getAllRatings(p.uscfId);
      enrichedPlayers.push({ ...p, ...ratings });
    }

    // STEP 3: Download
    downloadCSV(enrichedPlayers);
    statusDiv.innerHTML = "Done! CSV downloaded.";

  } catch (err) {
    console.error(err);
    statusDiv.innerHTML = "<b>Error:</b> " + err.message + "<br><br><i>Try refreshing the BayAreaChess page.</i>";
    statusDiv.className = "error";
  }
});

async function getAllRatings(uscfId) {
  let ratings = await getPublishedRatings(uscfId);
  ratings = await getLiveUpdates(uscfId, ratings);
  return ratings;
}

// 1. API Fetch
async function getPublishedRatings(uscfId) {
  const url = `https://ratings-api.uschess.org/api/v1/members/${uscfId}`;
  let ratings = { 'R': "Unrated", 'Q': "Unrated", 'B': "Unrated", 'OR': "Unrated", 'OQ': "Unrated", 'OB': "Unrated" };
  try {
    const resp = await fetch(url);
    if (resp.ok) {
      const data = await resp.json();
      if (data.ratings) {
        data.ratings.forEach(entry => {
          const code = entry.ratingSystem;
          const val = entry.rating;
          if (ratings.hasOwnProperty(code) && val) ratings[code] = val;
        });
      }
    }
  } catch (e) { console.warn("API Error", e); }
  return ratings;
}

// 2. Live History Parsing
async function getLiveUpdates(uscfId, currentRatings) {
  const cutoff = getCutoffDate();
  try {
    const profileUrl = `https://ratings.uschess.org/player/${uscfId}`;
    const profileResp = await fetch(profileUrl);
    const profileText = await profileResp.text();
    
    // Find event links
    const matches = profileText.matchAll(/\/event\/(\d{8})[a-zA-Z0-9_]*/g);
    const seenEvents = new Set();
    const validEvents = [];

    for (const match of matches) {
      const dateStr = match[1]; // "20240110"
      const urlPath = match[0]; // "/event/20240110..."
      const fullUrl = `https://ratings.uschess.org${urlPath}`;
      
      if (seenEvents.has(fullUrl)) continue;
      seenEvents.add(fullUrl);

      const year = parseInt(dateStr.substring(0, 4));
      const month = parseInt(dateStr.substring(4, 6)) - 1; 
      const day = parseInt(dateStr.substring(6, 8));
      const eventDate = new Date(year, month, day);

      if (eventDate >= cutoff) {
        validEvents.push({ date: eventDate, url: fullUrl });
      }
    }
    
    validEvents.sort((a, b) => b.date - a.date);

    // Scan events
    for (const event of validEvents) {
      await parseEventPage(uscfId, event.url, currentRatings);
    }
  } catch (e) { console.warn("Live Error", e); }
  return currentRatings;
}

async function parseEventPage(uscfId, eventUrl, currentRatings) {
  try {
    const resp = await fetch(eventUrl);
    const text = await resp.text();
    const isOnline = text.toLowerCase().includes("online");

    // Simple text search for the ID row to avoid heavy DOM parsing
    const lines = text.split("<tr");
    for (const line of lines) {
      if (line.includes(uscfId)) {
        // Clean tags
        const cleanLine = line.replace(/<[^>]+>/g, "|");
        // Look for rating changes: "R: 1200 => 1250"
        ['R', 'Q', 'B'].forEach(code => {
           // Regex: Code followed by numbers with arrow
           const regex = new RegExp(`${code}\\s*:\\s*\\d+\\s*=>\\s*(\\d+)`);
           const match = cleanLine.match(regex);
           if (match) {
             let key = code;
             if (isOnline) {
               if (code === 'R') key = 'OR';
               if (code === 'Q') key = 'OQ';
               if (code === 'B') key = 'OB';
             }
             currentRatings[key] = match[1];
           }
        });
      }
    }
  } catch (e) {}
}

function getCutoffDate() {
  const today = new Date();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const lastMonth = new Date(first - 1);
  const year = lastMonth.getFullYear();
  const month = lastMonth.getMonth();
  
  const wednesdays = [];
  for (let d = 1; d <= 31; d++) {
    const date = new Date(year, month, d);
    if (date.getMonth() !== month) break;
    if (date.getDay() === 3) wednesdays.push(date);
  }
  const target = wednesdays[2]; // 3rd wednesday
  target.setDate(target.getDate() - 2);
  return target;
}

function downloadCSV(data) {
  const headers = ["USCF ID", "Name", "Regular", "Quick", "Blitz", "Online Reg", "Online Quick", "Online Blitz"];
  const csvRows = [headers.join(",")];
  data.forEach(p => {
    const row = [p.uscfId, `"${p.name}"`, p.R, p.Q, p.B, p.OR, p.OQ, p.OB];
    csvRows.push(row.join(","));
  });
  const blob = new Blob([csvRows.join("\n")], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "uscf_entries_live.csv";
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
