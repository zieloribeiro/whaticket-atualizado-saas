module.exports = {
  up: async (queryInterface, Sequelize) => {
    await queryInterface.removeConstraint('Messages', 'Messages_quotedMsgId_fkey');
    await queryInterface.removeConstraint('Messages', 'Messages_pkey');

    await queryInterface.removeColumn('Messages', 'quotedMsgId');

    await queryInterface.addColumn('Messages', 'quotedMsgId', {
      type: Sequelize.INTEGER,
      allowNull: true
    });

    await queryInterface.addColumn('Messages', 'wid', {
      type: Sequelize.STRING,
      allowNull: true,
      unique: false
    });

    await queryInterface.sequelize.query('UPDATE "Messages" SET "wid" = "id"');

    await queryInterface.removeColumn('Messages', 'id');

    await queryInterface.addColumn('Messages', 'id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      primaryKey: true,
      autoIncrement: true,
      unique: true 
    });

    await queryInterface.addConstraint('Messages', {
      fields: ['quotedMsgId'],
      type: 'foreign key',
      name: 'Messages_quotedMsgId_fkey',
      references: {
        table: 'Messages',
        field: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    await queryInterface.sequelize.query('ALTER TABLE "Messages" ADD CONSTRAINT "Messages_pkey" PRIMARY KEY (id)');
  },

  down: async (queryInterface, Sequelize) => {
    await queryInterface.removeConstraint('Messages', 'Messages_quotedMsgId_fkey');
    await queryInterface.removeConstraint('Messages', 'Messages_pkey');

    await queryInterface.removeColumn('Messages', 'wid');

    await queryInterface.removeColumn('Messages', 'quotedMsgId');

    await queryInterface.removeColumn('Messages', 'id');

    await queryInterface.addColumn('Messages', 'id', {
      type: Sequelize.INTEGER,
      allowNull: false,
      autoIncrement: true
    });

    await queryInterface.addConstraint('Messages', {
      fields: ['quotedMsgId'],
      type: 'foreign key',
      name: 'Messages_quotedMsgId_fkey',
      references: {
        table: 'Messages',
        field: 'id'
      },
      onDelete: 'SET NULL',
      onUpdate: 'CASCADE'
    });

    await queryInterface.sequelize.query('ALTER TABLE "Messages" ADD CONSTRAINT "Messages_pkey" PRIMARY KEY (id)');
  }
};
