const analyticsService = require("../services/analytics.service");

const send = (loader) => async (req, res) => {
  const data = await loader(req.validated.query);
  res.status(200).json({ success: true, data });
};

module.exports = {
  overview: send(analyticsService.getOverview),
  tickets: send(analyticsService.getTicketStats),
  agents: send(analyticsService.getAgentStats),
  sla: send(analyticsService.getSlaStats),
};
