
const sequelize = require('./database');

async function testDatabase() {
  try {
    await sequelize.authenticate();

    console.log('FoodieHub MySQL connected successfully!');
    process.exit(0);
  } catch (error) {
    console.error('MySQL connection failed:', error.message);
    process.exit(1);
  }
}

testDatabase();
