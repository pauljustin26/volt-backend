// backend/src/admin/admin.controller.ts
import { Controller, Get, Req, UseGuards, ForbiddenException } from '@nestjs/common';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { firestore } from '../firebase/firebase.admin';

@UseGuards(FirebaseAuthGuard)
@Controller('admin')
export class AdminController {
  @Get('dashboard')
async getDashboard(@Req() req: any) {
  const { user } = req;

  if (!user.role || user.role !== 'admin') {
    throw new ForbiddenException('Not authorized');
  }

  try {
    // 1. Users & Volts Stats (Keep as is)
    const usersSnap = await firestore.collection('users').where('role', '==', 'user').get();
    const totalUsers = usersSnap.size;

    const voltsSnap = await firestore.collection('volts').get();
    let activeRentals = 0;
    let availableVolts = 0;
    voltsSnap.forEach((doc) => {
      const data = doc.data();
      if (data.status === 'rented') activeRentals++;
      if (data.status === 'available' || data.status === 'docked') availableVolts++;
    });

    // 2. Transactions & Revenue (FIXED)
    const transactionsSnap = await firestore.collectionGroup('transactions').get();
    
    let totalRevenue = 0;
    const revenueTimeline: Record<string, number> = {};
    const rentalsTimeline: Record<string, number> = {};
    
    // ⭐ FIX: Add a Set to track processed IDs to prevent double counting
    const processedTxnIds = new Set<string>();

    transactionsSnap.forEach((doc) => {
      // ⭐ FIX: Skip if we already processed this Transaction ID
      if (processedTxnIds.has(doc.id)) return;
      processedTxnIds.add(doc.id);

      const data = doc.data();

      // Revenue Calculation
      const isSuccess = data.status === 'succeeded' || data.status === 'completed';
      
      if (data.type === 'topup' && isSuccess) {
        const amount = Number(data.amount) || 0;
        totalRevenue += amount;

        const dateObj = data.completedAt?.toDate?.() || data.createdAt?.toDate?.();
        if (dateObj) {
           const dateKey = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
           revenueTimeline[dateKey] = (revenueTimeline[dateKey] || 0) + amount;
        }
      }

      // Rental Activity Count
      if (data.type === 'rent') {
        const dateObj = data.startTime?.toDate?.();
        if (dateObj) {
          const dateKey = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
          rentalsTimeline[dateKey] = (rentalsTimeline[dateKey] || 0) + 1;
        }
      }
    });

    return {
      totalUsers,
      activeRentals,
      availableVolts,
      totalRevenue,
      revenueTimeline,
      rentalsTimeline,
    };

  } catch (error) {
    console.error("Dashboard Error:", error);
    return {
      totalUsers: 0, activeRentals: 0, availableVolts: 0, totalRevenue: 0,
      revenueTimeline: {}, rentalsTimeline: {}
    };
  }
}

  @Get('transactions')
  async getAllTransactions(@Req() req: any) {
    const { user } = req;
    
    if (!user.role || user.role !== 'admin') {
      throw new ForbiddenException('Not authorized');
    }

    try {
      // 1. Fetch ALL transactions (This gets duplicates from root & subcollections)
      const snapshot = await firestore.collectionGroup('transactions').get();

      // 2. ⭐ DEDUPLICATE: Use a Map to store unique transactions by ID
      const uniqueTxns = new Map<string, any>();

      // 3. Prepare for User/Student ID lookup
      const userIdsToFetch = new Set<string>();

      snapshot.docs.forEach(doc => {
        // If we already have this ID, skip it (removes the duplicate)
        if (uniqueTxns.has(doc.id)) return;

        const data = doc.data();
        uniqueTxns.set(doc.id, { ...data, id: doc.id, ref: doc.ref }); // Store data + ref

        if (data.userId) userIdsToFetch.add(data.userId);
        if (!data.userId && doc.ref.parent.parent) {
             userIdsToFetch.add(doc.ref.parent.parent.id);
        }
      });

      // 4. Fetch User Profiles (Map UID -> Student ID)
      const userMap = new Map<string, string>();
      if (userIdsToFetch.size > 0) {
        const idsArray = Array.from(userIdsToFetch);
        const userDocs = await Promise.all(
          idsArray.map(id => firestore.collection('users').doc(id).get())
        );

        userDocs.forEach(uDoc => {
          if (uDoc.exists) {
            const uData = uDoc.data();
            if (uData?.studentId) {
              userMap.set(uDoc.id, uData.studentId);
            }
          }
        });
      }

      // 5. Build final list from our unique Map
      const transactions = Array.from(uniqueTxns.values()).map(data => {
        
        // Determine raw UID
        let rawUserId = data.userId;
        if (!rawUserId && data.ref.parent.parent) {
           rawUserId = data.ref.parent.parent.id;
        }

        // Resolve Student ID
        let finalDisplayId = data.studentId; 
        if (!finalDisplayId && rawUserId && userMap.has(rawUserId)) {
          finalDisplayId = userMap.get(rawUserId);
        }
        if (!finalDisplayId) {
           finalDisplayId = rawUserId || 'Unknown';
        }

        const dateObj = data.completedAt?.toDate?.() || data.createdAt?.toDate?.() || data.startTime?.toDate?.() || new Date();

        return {
          id: data.id,
          reference: data.id, // Or data.referenceId if you have it
          userId: finalDisplayId, 
          type: data.type || 'unknown',
          method: data.method,
          description: data.description || (data.type === 'rent' ? `Volt Rental` : data.type === 'topup' ? 'Wallet Top-up' : 'Transaction'),
          amount: Number(data.amount || data.fee || data.totalFee || 0),
          status: data.status || 'pending',
          date: dateObj,
        };
      });

      // Sort: Newest first
      transactions.sort((a, b) => b.date.getTime() - a.date.getTime());

      return { transactions };

    } catch (error) {
      console.error("Admin Transactions Error:", error);
      return { transactions: [] };
    }
  }
  @Get('users')
  async getUsers(@Req() req: any) {
    const { user } = req;
    
    if (!user.role || user.role !== 'admin') {
      throw new ForbiddenException('Not authorized');
    }

    try {
      // Query only where role is 'user' (excludes 'admin')
      const snapshot = await firestore.collection('users')
        .where('role', '==', 'user')
        .get();

      const users = snapshot.docs.map(doc => {
        const data = doc.data();
        
        // Handle timestamps safely
        const joinedDate = data.createdAt?.toDate?.() || new Date();

        return {
          uid: doc.id,
          studentId: data.studentId || 'N/A',
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          mobileNumber: data.mobileNumber || 'N/A',
          currentVolts: data.currentVolts || 0, // Assuming you track credits/volts
          isActive: !data.isBanned, // Example status flag
          joinedAt: joinedDate,
        };
      });

      // Sort alphabetically by Name
      users.sort((a, b) => a.firstName.localeCompare(b.firstName));

      return { users };

    } catch (error) {
      console.error("Fetch Users Error:", error);
      return { users: [] };
    }
  }
  @Get('volts')
  async getVolts(@Req() req: any) {
    const { user } = req;
    
    if (!user.role || user.role !== 'admin') {
      throw new ForbiddenException('Not authorized');
    }

    try {
      const snapshot = await firestore.collection('volts').get();

      const volts = snapshot.docs.map(doc => {
        const data = doc.data();
        
        // Determine logical status
        let status = data.status || 'unknown';
        
        // If it has a student assigned, override status to 'rented' if not already set
        if (data.studentId && data.studentId !== 'null') {
             status = 'rented';
        }

        return {
          id: doc.id, // e.g. "01", "02"
          battery: data.battery ?? 0,
          status: status,
          sensorStatus: data.sensorStatus || 'N/A',
          currentRenterId: data.studentId || null, // Shows who has it
          updatedAt: data.updatedAt?.toDate?.() || null,
        };
      });

      // Sort by ID (01, 02, 03...)
      volts.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

      return { volts };

    } catch (error) {
      console.error("Fetch Volts Error:", error);
      return { volts: [] };
    }
  }
}