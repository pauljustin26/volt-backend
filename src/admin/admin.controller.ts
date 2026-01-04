// backend/src/admin/admin.controller.ts
import { 
  Controller, 
  Get, 
  Post, 
  Req, 
  UseGuards, 
  UseInterceptors, 
  UploadedFile, 
  ForbiddenException, 
  BadRequestException, 
  Logger 
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { FirebaseAuthGuard } from '../auth/firebase-auth.guard';
import { firestore } from '../firebase/firebase.admin';
// FIX: Use default import for csv-parser to avoid "not callable" error
import csvParser from 'csv-parser'; 
import { Readable } from 'stream';

@UseGuards(FirebaseAuthGuard)
@Controller('admin')
export class AdminController {
  private readonly logger = new Logger(AdminController.name);

  @Get('dashboard')
  async getDashboard(@Req() req: any) {
    const { user } = req;

    if (!user.role || user.role !== 'admin') {
      throw new ForbiddenException('Not authorized');
    }

    try {
      // 1. Users Stats
      const usersSnap = await firestore.collection('users').where('role', '==', 'user').get();
      const totalUsers = usersSnap.size;

      // 2. Volts Stats & Distribution
      const voltsSnap = await firestore.collection('volts').get();
      let activeRentals = 0;
      let availableVolts = 0;
      
      const voltStatusDistribution: Record<string, number> = {
        available: 0,
        rented: 0,
        docked: 0,
        maintenance: 0
      };

      voltsSnap.forEach((doc) => {
        const data = doc.data();
        const status = data.status || 'unknown';
        
        if (status === 'rented') activeRentals++;
        if (status === 'available' || status === 'docked') availableVolts++;

        if (voltStatusDistribution[status] !== undefined) {
          voltStatusDistribution[status]++;
        } else {
          voltStatusDistribution['maintenance']++; 
        }
      });

      // 3. Transactions Processing
      const transactionsSnap = await firestore.collectionGroup('transactions').get();
      
      let totalRevenue = 0;
      const revenueTimeline: Record<string, number> = {};
      const rentalsTimeline: Record<string, number> = {};
      
      const transactionTypeStats: Record<string, number> = {
        rent: 0,
        return: 0,
        topup: 0
      };

      const processedTxnIds = new Set<string>();

      transactionsSnap.forEach((doc) => {
        if (processedTxnIds.has(doc.id)) return;
        processedTxnIds.add(doc.id);

        const data = doc.data();
        
        // --- STEP A: ROBUST TYPE INFERENCE ---
        let type = data.type;

        if (!type) {
            if (data.startTime && data.endTime) type = 'return'; 
            else if (data.startTime && !data.endTime) type = 'rent'; 
            else if (data.amount && !data.fee) type = 'topup'; 
        }

        // --- STEP B: Aggregate Counts ---
        if (type === 'rent') transactionTypeStats.rent++;
        else if (type === 'return') transactionTypeStats.return++;
        else if (type === 'topup') transactionTypeStats.topup++;

        // --- STEP C: Revenue Calculation ---
        const isSuccess = data.status === 'succeeded' || data.status === 'completed';
        let txnAmount = 0;

        if (isSuccess) {
            if (type === 'topup') {
                txnAmount = Number(data.amount) || 0;
            } 
            else if (type === 'rent') {
                txnAmount = Number(data.fee) || 0;
            } 
            else if (type === 'return') {
                const fee = Number(data.fee) || 0;
                const penalty = Number(data.penaltyFee) || 0;
                txnAmount = fee + penalty;
            }
        }

        // Add to Total & Revenue Timeline
        if (txnAmount > 0) {
          totalRevenue += txnAmount;

          const dateObj = data.completedAt?.toDate?.() || data.createdAt?.toDate?.() || data.endTime?.toDate?.();
          if (dateObj) {
             const dateKey = dateObj.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
             revenueTimeline[dateKey] = (revenueTimeline[dateKey] || 0) + txnAmount;
          }
        }

        // --- STEP D: Rental Volume Timeline ---
        if (type === 'rent' || type === 'return') {
          const dateObj = data.startTime?.toDate?.() || data.createdAt?.toDate?.();
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
        voltStatusDistribution,
        transactionTypeStats
      };

    } catch (error) {
      console.error("Dashboard Error:", error);
      return {
        totalUsers: 0, activeRentals: 0, availableVolts: 0, totalRevenue: 0,
        revenueTimeline: {}, rentalsTimeline: {}, voltStatusDistribution: {}, transactionTypeStats: {}
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
      const snapshot = await firestore.collectionGroup('transactions').get();
      const uniqueTxns = new Map<string, any>();
      const userIdsToFetch = new Set<string>();

      snapshot.docs.forEach(doc => {
        if (uniqueTxns.has(doc.id)) return;
        const data = doc.data();
        uniqueTxns.set(doc.id, { ...data, id: doc.id, ref: doc.ref }); 

        if (data.userId) userIdsToFetch.add(data.userId);
        if (!data.userId && doc.ref.parent.parent) {
             userIdsToFetch.add(doc.ref.parent.parent.id);
        }
      });

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

      const transactions = Array.from(uniqueTxns.values()).map(data => {
        let rawUserId = data.userId;
        if (!rawUserId && data.ref.parent.parent) {
           rawUserId = data.ref.parent.parent.id;
        }

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
          reference: data.id, 
          userId: finalDisplayId, 
          type: data.type || 'unknown',
          method: data.method,
          description: data.description || (data.type === 'rent' ? `Volt Rental` : data.type === 'topup' ? 'Wallet Top-up' : 'Transaction'),
          amount: Number(data.amount || data.fee || data.totalFee || 0),
          status: data.status || 'pending',
          date: dateObj,
        };
      });

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
      const snapshot = await firestore.collection('users')
        .where('role', '==', 'user')
        .get();

      const users = snapshot.docs.map(doc => {
        const data = doc.data();
        const joinedDate = data.createdAt?.toDate?.() || new Date();

        return {
          uid: doc.id,
          studentId: data.studentId || 'N/A',
          firstName: data.firstName || '',
          lastName: data.lastName || '',
          email: data.email || '',
          mobileNumber: data.mobileNumber || 'N/A',
          currentVolts: data.currentVolts || 0, 
          isActive: !data.isBanned, 
          joinedAt: joinedDate,
        };
      });

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
        let status = data.status || 'unknown';
        
        if (data.studentId && data.studentId !== 'null') {
             status = 'rented';
        }

        return {
          id: doc.id,
          battery: data.battery ?? 0,
          status: status,
          sensorStatus: data.sensorStatus || 'N/A',
          currentRenterId: data.studentId || null,
          updatedAt: data.updatedAt?.toDate?.() || null,
        };
      });

      volts.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

      return { volts };

    } catch (error) {
      console.error("Fetch Volts Error:", error);
      return { volts: [] };
    }
  }

  // ---------------- UPLOAD STUDENT CSV ----------------
  @Post('upload-students')
  @UseInterceptors(FileInterceptor('file')) 
  async uploadStudentList(@UploadedFile() file: Express.Multer.File, @Req() req: any) {
    const { user } = req;
    
    if (user.role !== 'admin') {
      throw new ForbiddenException('Only admins can update the student list.');
    }

    if (!file) {
      throw new BadRequestException('No CSV file uploaded.');
    }

    // FIX: Explicitly type 'students' array as any[]
    const students: any[] = [];
    const stream = Readable.from(file.buffer.toString());

    await new Promise((resolve, reject) => {
      stream
        .pipe(csvParser())
        .on('data', (row: any) => { // FIX: Explicitly type 'row' as any
          
          // FIX: Explicitly type 'cleanRow' to allow indexing
          const cleanRow: any = {};
          
          Object.keys(row).forEach(key => {
            cleanRow[key.trim()] = row[key].trim();
          });

          if (cleanRow['studentId']) {
            students.push(cleanRow);
          }
        })
        .on('end', resolve)
        .on('error', reject);
    });

    if (students.length === 0) {
      return { message: 'CSV was empty or had no valid studentId column.' };
    }

    const batchSize = 500;
    let batch = firestore.batch();
    let count = 0;
    let totalAdded = 0;

    for (const student of students) {
      const docRef = firestore.collection('student_whitelist').doc(student.studentId);
      
      batch.set(docRef, {
        studentId: student.studentId,
        firstName: student.firstName || '',
        lastName: student.lastName || '',
        email: student.email || '', // <--- ADD THIS LINE
        updatedAt: new Date()
      });

      count++;
      totalAdded++;

      if (count === batchSize) {
        await batch.commit();
        batch = firestore.batch();
        count = 0;
      }
    }

    if (count > 0) {
      await batch.commit();
    }

    this.logger.log(`Admin ${user.uid} uploaded ${totalAdded} students to whitelist.`);

    return { 
      message: `Successfully processed ${totalAdded} students into the whitelist.`,
      count: totalAdded
    };
  }

  // ---------------- GET WHITELIST (For the Modal) ----------------
  @Get('whitelist')
  async getWhitelist(@Req() req: any) {
    const { user } = req;
    if (user.role !== 'admin') throw new ForbiddenException('Not authorized');

    try {
      // Fetch all docs from student_whitelist
      // NOTE: If you have >10,000 students, you should implement pagination here.
      const snapshot = await firestore.collection('student_whitelist').get();
      
      const students = snapshot.docs.map(doc => ({
        id: doc.id,
        ...doc.data()
      }));

      // Sort by lastName alphabetically
      students.sort((a: any, b: any) => (a.lastName || '').localeCompare(b.lastName || ''));

      return { students };
    } catch (error) {
      this.logger.error("Error fetching whitelist", error);
      return { students: [] };
    }
  }
}