export default async function handler(request, response) {
  // 1. Get credentials from Vercel Environment Variables
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_KEY;

  if (!url || !key) {
    return response.status(500).json({ error: 'Missing environment variables.' });
  }

  try {
    // 2. Perform a lightweight "read" operation (Limit 1 row, select only ID)
    // This counts as "Active Usage" to Supabase.
    const target = `${url}/rest/v1/todos?select=id&limit=1`;
    
    const dbResponse = await fetch(target, {
      method: 'GET',
      headers: {
        'apikey': key,
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json'
      }
    });

    if (dbResponse.ok) {
      const data = await dbResponse.json();
      return response.status(200).json({ 
        status: 'Alive', 
        message: 'Supabase pinged successfully.', 
        data_preview: data 
      });
    } else {
      return response.status(dbResponse.status).json({ 
        error: 'Supabase Error', 
        details: await dbResponse.text() 
      });
    }

  } catch (error) {
    return response.status(500).json({ error: error.message });
  }
}
