class InstanceCoordinator {
    constructor(database) {
        this.db = database;
        this.instanceId = `instance_${Date.now()}_${Math.random().toString(36).substring(7)}`;
        this.activeLocks = new Map();
        this.lockTimeout = 30000; // 30 seconds
        
        console.log(`🔒 Instance Coordinator initialized: ${this.instanceId}`);
    }

    // Initialize lock table
    async init() {
        try {
            await this.db.run(`
                CREATE TABLE IF NOT EXISTS instance_locks (
                    lock_key TEXT PRIMARY KEY,
                    instance_id TEXT NOT NULL,
                    created_at INTEGER NOT NULL,
                    expires_at INTEGER NOT NULL
                )
            `);
            
            // Clean up expired locks on startup
            await this.cleanupExpiredLocks();
            console.log('✅ Instance lock system initialized');
        } catch (error) {
            console.error('❌ Failed to initialize instance locks:', error);
            throw error;
        }
    }

    // Acquire a lock for a specific operation
    async acquireLock(lockKey, timeoutMs = this.lockTimeout) {
        const now = Date.now();
        const expiresAt = now + timeoutMs;
        
        try {
            // First clean up any expired locks
            await this.cleanupExpiredLocks();
            
            // Try to acquire lock atomically
            const result = await this.db.run(`
                INSERT OR IGNORE INTO instance_locks (lock_key, instance_id, created_at, expires_at)
                VALUES (?, ?, ?, ?)
            `, [lockKey, this.instanceId, now, expiresAt]);
            
            if (result.changes > 0) {
                // Successfully acquired lock
                this.activeLocks.set(lockKey, expiresAt);
                console.log(`🔒 Lock acquired: ${lockKey} by ${this.instanceId}`);
                return true;
            } else {
                // Failed to acquire lock, check if it's expired
                const existingLock = await this.db.get(
                    'SELECT * FROM instance_locks WHERE lock_key = ?',
                    [lockKey]
                );
                
                if (existingLock && existingLock.expires_at < now) {
                    // Lock is expired, force acquire it
                    await this.db.run(
                        'UPDATE instance_locks SET instance_id = ?, created_at = ?, expires_at = ? WHERE lock_key = ?',
                        [this.instanceId, now, expiresAt, lockKey]
                    );
                    this.activeLocks.set(lockKey, expiresAt);
                    console.log(`🔒 Lock force-acquired (expired): ${lockKey} by ${this.instanceId}`);
                    return true;
                }
                
                console.log(`❌ Failed to acquire lock: ${lockKey} (held by another instance)`);
                return false;
            }
        } catch (error) {
            console.error(`❌ Error acquiring lock ${lockKey}:`, error);
            return false;
        }
    }

    // Release a lock
    async releaseLock(lockKey) {
        try {
            await this.db.run(
                'DELETE FROM instance_locks WHERE lock_key = ? AND instance_id = ?',
                [lockKey, this.instanceId]
            );
            
            this.activeLocks.delete(lockKey);
            console.log(`🔓 Lock released: ${lockKey} by ${this.instanceId}`);
        } catch (error) {
            console.error(`❌ Error releasing lock ${lockKey}:`, error);
        }
    }

    // Clean up expired locks
    async cleanupExpiredLocks() {
        try {
            const now = Date.now();
            const result = await this.db.run(
                'DELETE FROM instance_locks WHERE expires_at < ?',
                [now]
            );
            
            if (result.changes > 0) {
                console.log(`🧹 Cleaned up ${result.changes} expired locks`);
            }
        } catch (error) {
            console.error('❌ Error cleaning up expired locks:', error);
        }
    }

    // Execute an operation with a lock
    async withLock(lockKey, operation, timeoutMs = this.lockTimeout) {
        const acquired = await this.acquireLock(lockKey, timeoutMs);
        if (!acquired) {
            throw new Error(`Could not acquire lock: ${lockKey}`);
        }
        
        try {
            return await operation();
        } finally {
            await this.releaseLock(lockKey);
        }
    }

    // Execute database transaction with lock
    async lockedTransaction(lockKey, transactionFn, timeoutMs = this.lockTimeout) {
        return await this.withLock(lockKey, async () => {
            // Use manual transaction with the Database wrapper class
            try {
                this.db.db.exec('BEGIN TRANSACTION');
                const result = await transactionFn();
                this.db.db.exec('COMMIT');
                return result;
            } catch (error) {
                try {
                    this.db.db.exec('ROLLBACK');
                } catch (rollbackError) {
                    console.error('Error during rollback:', rollbackError);
                }
                throw error;
            }
        }, timeoutMs);
    }

    // Clean up on shutdown
    async cleanup() {
        try {
            // Release all our locks
            await this.db.run(
                'DELETE FROM instance_locks WHERE instance_id = ?',
                [this.instanceId]
            );
            console.log(`🧹 Cleaned up all locks for instance ${this.instanceId}`);
        } catch (error) {
            console.error('❌ Error during cleanup:', error);
        }
    }

    // Check if we hold a specific lock
    hasLock(lockKey) {
        const expiresAt = this.activeLocks.get(lockKey);
        if (!expiresAt) return false;
        
        if (Date.now() > expiresAt) {
            // Lock has expired locally
            this.activeLocks.delete(lockKey);
            return false;
        }
        
        return true;
    }

    // Get instance ID
    getInstanceId() {
        return this.instanceId;
    }
}

module.exports = InstanceCoordinator;
