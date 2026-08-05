const TOGGL_API_TOKEN = process.env.TOGGL_API_TOKEN;
const TOGGL_WORKSPACE_ID = process.env.TOGGL_WORKSPACE_ID;
const NOTION_KEY = process.env.NOTION_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

// Encode Basic Auth string for Toggl Track
const togglAuth = Buffer.from(`${TOGGL_API_TOKEN}:api_token`).toString('base64');

async function getTogglSummary() {
  // Get today's date formatted as YYYY-MM-DD in local time
  const today = new Date().toLocaleDateString('en-CA'); 

  const response = await fetch(`https://api.track.toggl.com/reports/api/v3/workspace/${TOGGL_WORKSPACE_ID}/summary/time_entries`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${togglAuth}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      start_date: today,
      end_date: today,
      grouping: "projects"
    })
  });

  if (!response.ok) {
    throw new Error(`Toggl API error: ${response.statusText}`);
  }

  const data = await response.json();
  const projectHours = {};
  if (data.groups) {
    for (const group of data.groups) {
      const totalSeconds = group.sub_groups?.reduce((acc, sg) => acc + (sg.seconds || 0), 0) || 0;
      projectHours[group.id] = (totalSeconds / 3600).toFixed(2);
    }
  }
  return projectHours;
}

async function getNotionPages() {
  const response = await fetch(`https://api.notion.com/v1/databases/${NOTION_DATABASE_ID}/query`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${NOTION_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Notion API error: ${response.statusText}`);
  }

  const data = await response.json();
  return data.results;
}

async function updateNotionPage(pageId, hours) {
  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${NOTION_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      properties: {
        "Logged Hours": {
          number: parseFloat(hours)
        }
      }
    })
  });
}

async function runSync() {
  console.log("Starting Toggl to Notion Sync...");
  const togglSummary = await getTogglSummary();
  const notionPages = await getNotionPages();

  for (const page of notionPages) {
    const pageId = page.id;
    const togglProjectId = page.properties["Toggl Project ID"]?.number;

    if (togglProjectId) {
      // If the project ID isn't in Toggl's summary response, it means 0 hours were logged today
      const hours = togglSummary[togglProjectId] ?? 0;
      
      await updateNotionPage(pageId, hours);
      console.log(`Updated Page ID ${pageId} with ${hours} hours.`);
    }
  }
  console.log("Sync completed successfully.");
}

runSync().catch(err => console.error(err));