/**
 * `--dashboard` — owner-only prefix command.
 *
 * Boots the local web dashboard (see src/services/dashboardService.js) and
 * pins a status message with live stats and a button row:
 *   📊 Open dashboard (link) · 🔄 Refresh · ♻️ Restart · ⏹ Close
 */
const dashboardService = require('../services/dashboardService');
const embeds = require('../utils/embeds');

module.exports = {
  name: 'dashboard',
  description: 'Launch the local ModMail web dashboard (owner only).',
  ownerOnly: true,

  async execute(client, message) {
    try {
      const result = await dashboardService.start(client);
      const embed = await dashboardService.buildLiveEmbed(client, result);
      const components = [dashboardService.buildDashboardButtons({ url: result.url, running: true })];

      const statusMessage = await message.reply({
        embeds: [embed],
        components
      });

      dashboardService.attachStatusMessage(statusMessage);
    } catch (error) {
      await message.reply({
        embeds: [embeds.errorEmbed(`Failed to start the dashboard: ${error.message}`)]
      }).catch(() => {});
    }
  }
};
