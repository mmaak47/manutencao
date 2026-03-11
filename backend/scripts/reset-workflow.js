const seq = require('../config/database');

seq.authenticate().then(async () => {
  await seq.query("UPDATE screens SET workflowStatus = 'none' WHERE workflowStatus = 'todo' OR workflowStatus IS NULL");
  console.log('Updated screens to none');
  const [rows] = await seq.query("SELECT workflowStatus, COUNT(*) as cnt FROM screens GROUP BY workflowStatus");
  console.log('Workflow counts:', rows);
  process.exit(0);
});
