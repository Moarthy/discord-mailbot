const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const store = require('../store/ticketStore');
const embeds = require('../utils/embeds');
const logService = require('../services/logService');
const auditService = require('../services/auditService');
const { isModerator } = require('../utils/permissions');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Manage who can contact ModMail.')
    .addSubcommand((sub) => sub
      .setName('add')
      .setDescription('Block a user from opening tickets.')
      .addUserOption((option) => option.setName('user').setDescription('User to block.').setRequired(true))
      .addStringOption((option) => option.setName('reason').setDescription('Reason shown to the user.').setRequired(false)))
    .addSubcommand((sub) => sub
      .setName('remove')
      .setDescription('Unblock a user.')
      .addUserOption((option) => option.setName('user').setDescription('User to unblock.').setRequired(true)))
    .addSubcommand((sub) => sub.setName('show').setDescription('List blocked users.'))
    .setDMPermission(false),

  async execute(interaction) {
    if (!isModerator(interaction.member)) {
      return interaction.reply({ embeds: [embeds.errorEmbed('Staff only.')], flags: MessageFlags.Ephemeral });
    }

    const sub = interaction.options.getSubcommand();

    if (sub === 'add') {
      const target = interaction.options.getUser('user');
      const reason = interaction.options.getString('reason') ?? 'No reason provided.';

      if (target.bot) {
        return interaction.reply({ embeds: [embeds.errorEmbed('Bots cannot be blacklisted.')], flags: MessageFlags.Ephemeral });
      }

      if (target.id === interaction.guild.ownerId) {
        return interaction.reply({ embeds: [embeds.errorEmbed('The server owner cannot be blacklisted.')], flags: MessageFlags.Ephemeral });
      }

      const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);

      if (targetMember && isModerator(targetMember)) {
        return interaction.reply({ embeds: [embeds.errorEmbed('Staff members cannot be blacklisted.')], flags: MessageFlags.Ephemeral });
      }

      store.blacklistAdd(target.id, { reason, byId: interaction.user.id });

      auditService.blacklist.added(
        { id: interaction.user.id, tag: interaction.user.tag },
        { targetId: target.id, targetTag: target.tag, reason }
      );

      await logService.send(
        interaction.client,
        embeds.systemEmbed(`⛔ ${target.tag} was blacklisted by ${interaction.user.tag}. Reason: ${reason}`, embeds.Colors.danger)
      );

      return interaction.reply({ embeds: [embeds.systemEmbed(`⛔ ${target.tag} can no longer contact ModMail.`)] });
    }

    if (sub === 'remove') {
      const target = interaction.options.getUser('user');
      store.blacklistRemove(target.id);

      auditService.blacklist.removed(
        { id: interaction.user.id, tag: interaction.user.tag },
        { targetId: target.id, targetTag: target.tag }
      );

      await logService.send(
        interaction.client,
        embeds.systemEmbed(`✅ ${target.tag} was removed from the blacklist by ${interaction.user.tag}.`, embeds.Colors.success)
      );

      return interaction.reply({ embeds: [embeds.systemEmbed(`✅ ${target.tag} can contact ModMail again.`)] });
    }

    const list = store.listBlacklist();

    if (!list.length) {
      return interaction.reply({ embeds: [embeds.systemEmbed('No users are blacklisted.')], flags: MessageFlags.Ephemeral });
    }

    const lines = list.map((entry) => `• <@${entry.userId}> — ${entry.reason}`);
    return interaction.reply({
      embeds: [embeds.systemEmbed(`**Blacklisted users:**\n${lines.join('\n')}`)],
      flags: MessageFlags.Ephemeral
    });
  }
};
