'use strict';
const { DataTypes } = require('sequelize');

module.exports = {
  async up(queryInterface) {
    const columns=await queryInterface.describeTable('branches');
    if(!columns.temporary_closure_until)await queryInterface.addColumn('branches','temporary_closure_until',{type:DataTypes.DATE,allowNull:true});
    if(!columns.temporary_closure_reason)await queryInterface.addColumn('branches','temporary_closure_reason',{type:DataTypes.STRING(100),allowNull:true});
    if(!columns.temporary_closure_token)await queryInterface.addColumn('branches','temporary_closure_token',{type:DataTypes.STRING(36),allowNull:true});
    const indexes=await queryInterface.showIndex('branches');
    if(!indexes.some(index=>index.name==='branches_scheduled_closure_idx'))await queryInterface.addIndex('branches',['operational_status','temporary_closure_until'],{name:'branches_scheduled_closure_idx'});
    if(!indexes.some(index=>index.name==='branches_closure_token_idx'))await queryInterface.addIndex('branches',['temporary_closure_token'],{name:'branches_closure_token_idx'});
  },
  async down(queryInterface) {
    await queryInterface.removeIndex('branches','branches_closure_token_idx');
    await queryInterface.removeIndex('branches','branches_scheduled_closure_idx');
    await queryInterface.removeColumn('branches','temporary_closure_token');
    await queryInterface.removeColumn('branches','temporary_closure_reason');
    await queryInterface.removeColumn('branches','temporary_closure_until');
  },
};
