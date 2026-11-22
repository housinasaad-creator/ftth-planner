// Supabase connection (project "roadsense-map", private schema `ftth`, reached only through the ftth_* RPC functions).
// The anon key is public by design: the database rules decide what it may do (tables are closed, only the 5 functions are open).
window.FT_CFG = {
  url: 'https://vdonusyzntffgrvfsdeq.supabase.co',
  anonKey: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InZkb251c3l6bnRmZmdydmZzZGVxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3OTI4NzU5NzEsImV4cCI6MjEwODQ1MTk3MX0.E-B6vjF9Qcg5cLawFpImMAQrJHk15I-vEutpU1Mlis8',
};
