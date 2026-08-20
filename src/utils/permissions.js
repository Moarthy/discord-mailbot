const { PermissionsBitField } = require('discord.js');

const config = require('../config');

function isModerator(member) {
  if (!member) return false;
  if (member.permissions.has(PermissionsBitField.Flags.Administrator)) return true;
  if (config.moderatorRoleId) return Boolean(member.roles.resolve(config.moderatorRoleId));
  return (
    member.permissions.has(PermissionsBitField.Flags.ManageMessages) ||
    member.permissions.has(PermissionsBitField.Flags.ManageGuild)
  );
}

module.exports = { isModerator };
