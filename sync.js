const TOGGL_API_TOKEN = process.env.TOGGL_API_TOKEN;
const NOTION_KEY = process.env.NOTION_KEY;
const NOTION_DATABASE_ID = process.env.NOTION_DATABASE_ID;

// Encode Basic Auth string for Toggl Track
const togglAuth = Buffer.from(`${TOGGL_API_TOKEN}:api_token`).toString('base64');

async function getTogglGoals() {
  const response = await fetch(`https://api.track.toggl.com/api/v9/sync-server/me/goals`, {
    method: 'GET',
    headers: {
      'Authorization': `Basic ${togglAuth}`,
      'Content-Type': 'application/json'
    }
  });

  if (!response.ok) {
    throw new Error(`Toggl Goals API error: ${response.statusText}`);
  }

  const goals = await response.json();
  const goalMap = {};

  for (const goal of goals) {
    goalMap[goal.goal_id] = {
      name: goal.name,
      trackedHours: ((goal.current_recurrence_tracked_seconds || 0) / 3600).toFixed(2),
      targetHours: ((goal.target_seconds || 0) / 3600).toFixed(2),
      streak: goal.streak || 0
    };
  }

  return goalMap;
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

async function updateNotionGoalPage(pageId, goalData) {
  const properties = {
    // Updates the Page Title/Name property (Change "Name" if your Title column is named differently, e.g. "Goal Name")
    "Name": {
      title: [
        {
          text: {
            content: goalData.name
          }
        }
      ]
    },
    "Logged Hours": {
      number: parseFloat(goalData.trackedHours)
    }
  };

  // Optional: Update Target Hours and Streak if those columns exist in Notion
  if (goalData.targetHours !== undefined) {
    properties["Target Hours"] = { number: parseFloat(goalData.targetHours) };
  }
  if (goalData.streak !== undefined) {
    properties["Streak"] = { number: parseInt(goalData.streak) };
  }

  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: 'PATCH',
    headers: {
      'Authorization': `Bearer ${NOTION_KEY}`,
      'Notion-Version': '2022-06-28',
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ properties })
  });
}

async function runSync() {
  console.log("Starting Toggl Goals to Notion Sync...");
  const goalsMap = await getTogglGoals();
  const notionPages = await getNotionPages();

  for (const page of notionPages) {
    const pageId = page.id;
    const togglGoalId = page.properties["Toggl Goal ID"]?.number;

    if (togglGoalId && goalsMap[togglGoalId]) {
      const goal = goalsMap[togglGoalId];
      await updateNotionGoalPage(pageId, goal);
      console.log(`Updated Goal Name "${goal.name}" (Page ID ${pageId}) with ${goal.trackedHours} hrs.`);
    } else if (togglGoalId) {
      console.log(`Goal ID ${togglGoalId} not found in active Toggl goals.`);
    }
  }
  console.log("Sync completed successfully.");
}

runSync().catch(err => console.error(err));