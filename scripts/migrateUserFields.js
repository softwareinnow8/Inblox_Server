// Migration script to add phoneNumber and isProfileComplete fields to existing users
import mongoose from 'mongoose';
import dotenv from 'dotenv';

dotenv.config();

const MONGO_URI = process.env.MONGO_URI || process.env.MONGODB_URI;

async function migrate() {
  try {
    console.log('Connecting to MongoDB...');
    await mongoose.connect(MONGO_URI);
    console.log('Connected to MongoDB');

    const db = mongoose.connection.db;
    const usersCollection = db.collection('users');

    // Update all users that don't have phoneNumber field
    const result1 = await usersCollection.updateMany(
      { phoneNumber: { $exists: false } },
      { $set: { phoneNumber: null } }
    );
    console.log(`Added phoneNumber field to ${result1.modifiedCount} users`);

    // Update all users that don't have isProfileComplete field
    // Set isProfileComplete to true for local auth users (they already have all required fields)
    // Set isProfileComplete to false for google auth users (they need to complete profile)
    const result2 = await usersCollection.updateMany(
      { isProfileComplete: { $exists: false }, authProvider: 'local' },
      { $set: { isProfileComplete: true } }
    );
    console.log(`Set isProfileComplete=true for ${result2.modifiedCount} local auth users`);

    const result3 = await usersCollection.updateMany(
      { isProfileComplete: { $exists: false }, authProvider: 'google' },
      { $set: { isProfileComplete: false } }
    );
    console.log(`Set isProfileComplete=false for ${result3.modifiedCount} google auth users`);

    // For any remaining users without isProfileComplete
    const result4 = await usersCollection.updateMany(
      { isProfileComplete: { $exists: false } },
      { $set: { isProfileComplete: false } }
    );
    console.log(`Set isProfileComplete=false for ${result4.modifiedCount} other users`);

    console.log('\n✅ Migration completed successfully!');
    
    // Show summary
    const totalUsers = await usersCollection.countDocuments();
    const usersWithPhone = await usersCollection.countDocuments({ phoneNumber: { $ne: null } });
    const completeProfiles = await usersCollection.countDocuments({ isProfileComplete: true });
    
    console.log('\n📊 Summary:');
    console.log(`   Total users: ${totalUsers}`);
    console.log(`   Users with phone number: ${usersWithPhone}`);
    console.log(`   Complete profiles: ${completeProfiles}`);
    console.log(`   Incomplete profiles: ${totalUsers - completeProfiles}`);

  } catch (error) {
    console.error('Migration error:', error);
  } finally {
    await mongoose.disconnect();
    console.log('\nDisconnected from MongoDB');
  }
}

migrate();
