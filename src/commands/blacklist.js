const { SlashCommandBuilder, MessageFlags } = require('discord.js');

const store = require('../store/ticketStore');
const embeds = require('../utils/embeds');
const logService = require('../services/logService');
const { isModerator } = require('../utils/permissions');
const { truncate } = require('../utils/text');

module.exports = {
  data: new SlashCommandBuilder()
    .setName('blacklist')
    .setDescription('Manage who can contact ModMail.')
    .addSubcommand((sub) => sub
      .setName('add')
      .setDescription('Block a user from opening tickets.')
      .addUserOption((option) => option.setName('user').setDescription('User to block.').setRequired(true))
      .addStringOption((option) => option
        .setName('reason')
        .setDescription('Reason shown to the user.')
        .setMaxLength(500)
        .setRequired(false)))
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

      // The member fetch and log post are both network calls, so claim the
      // interaction token before either of them runs.
      await interaction.deferReply();

      const targetMember = await interaction.guild.members.fetch(target.id).catch(() => null);

      if (targetMember && isModerator(targetMember)) {
        return interaction.editReply({ embeds: [embeds.errorEmbed('Staff members cannot be blacklisted.')] });
      }

      store.blacklistAdd(target.id, { reason, byId: interaction.user.id });

      await interaction.editReply({ embeds: [embeds.systemEmbed(`⛔ ${target.tag} can no longer contact ModMail.`)] });

      await logService.send(
        interaction.client,
        embeds.systemEmbed(`⛔ ${target.tag} was blacklisted by ${interaction.user.tag}. Reason: ${reason}`, embeds.Colors.danger)
      );

      return undefined;
    }

    if (sub === 'remove') {
      const target = interaction.options.getUser('user');
      store.blacklistRemove(target.id);

      await interaction.reply({ embeds: [embeds.systemEmbed(`✅ ${target.tag} can contact ModMail again.`)] });

      await logService.send(
        interaction.client,
        embeds.systemEmbed(`✅ ${target.tag} was removed from the blacklist by ${interaction.user.tag}.`, embeds.Colors.success)
      );

      return undefined;
    }

    const list = store.listBlacklist();

    if (!list.length) {
      return interaction.reply({ embeds: [embeds.systemEmbed('No users are blacklisted.')], flags: MessageFlags.Ephemeral });
    }

    // The full list can outgrow a single embed description, so entries are
    // added until the budget runs out and the remainder is summarised.
    const header = `**Blacklisted users (${list.length}):**`;
    const budget = embeds.Limits.description - 64;

    const shown = [];
    let used = header.length;

    for (const entry of list) {
      const line = `• <@${entry.userId}> — ${truncate(entry.reason, 100)}`;
      if (used + line.length + 1 > budget) break;
      shown.push(line);
      used += line.length + 1;
    }

    const remaining = list.length - shown.length;
    const body = [header, ...shown, remaining > 0 ? `…and ${remaining} more.` : null]
      .filter(Boolean)
      .join('\n');

    return interaction.reply({
      embeds: [embeds.systemEmbed(body)],
      flags: MessageFlags.Ephemeral
    });
  }
};
