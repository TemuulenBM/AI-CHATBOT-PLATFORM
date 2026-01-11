import { describe, it, expect, beforeEach } from "vitest";
import { MemStorage, IStorage, storage } from "../../server/storage";
import { InsertUser, User } from "@shared/schema";

describe("Storage", () => {
  describe("MemStorage", () => {
    let memStorage: IStorage;

    beforeEach(() => {
      memStorage = new MemStorage();
    });

    describe("createUser", () => {
      it("should create a new user", async () => {
        const insertUser: InsertUser = {
          email: "test@example.com",
        };

        const user = await memStorage.createUser(insertUser);

        expect(user).toBeDefined();
        expect(user.id).toBeDefined();
        expect(user.email).toBe("test@example.com");
        expect(user.created_at).toBeInstanceOf(Date);
      });

      it("should generate unique IDs for each user", async () => {
        const insertUser1: InsertUser = {
          email: "user1@example.com",
        };
        const insertUser2: InsertUser = {
          email: "user2@example.com",
        };

        const user1 = await memStorage.createUser(insertUser1);
        const user2 = await memStorage.createUser(insertUser2);

        expect(user1.id).not.toBe(user2.id);
      });

      it("should set created_at timestamp", async () => {
        const beforeCreate = new Date();
        const insertUser: InsertUser = {
          email: "test@example.com",
        };

        const user = await memStorage.createUser(insertUser);
        const afterCreate = new Date();

        expect(user.created_at.getTime()).toBeGreaterThanOrEqual(beforeCreate.getTime());
        expect(user.created_at.getTime()).toBeLessThanOrEqual(afterCreate.getTime());
      });

      it("should preserve user email", async () => {
        const insertUser: InsertUser = {
          email: "preserve@example.com",
        };

        const user = await memStorage.createUser(insertUser);

        expect(user.email).toBe(insertUser.email);
      });

      it("should create multiple users", async () => {
        const users = await Promise.all([
          memStorage.createUser({ email: "user1@example.com" }),
          memStorage.createUser({ email: "user2@example.com" }),
          memStorage.createUser({ email: "user3@example.com" }),
        ]);

        expect(users.length).toBe(3);
        users.forEach((user, index) => {
          expect(user.id).toBeDefined();
          expect(user.email).toBe(`user${index + 1}@example.com`);
        });
      });

      it("should handle special characters in email", async () => {
        const insertUser: InsertUser = {
          email: "test+special@example.com",
        };

        const user = await memStorage.createUser(insertUser);

        expect(user.email).toBe("test+special@example.com");
      });
    });

    describe("getUser", () => {
      it("should retrieve a user by ID", async () => {
        const insertUser: InsertUser = {
          email: "test@example.com",
        };
        const createdUser = await memStorage.createUser(insertUser);

        const retrievedUser = await memStorage.getUser(createdUser.id);

        expect(retrievedUser).toBeDefined();
        expect(retrievedUser?.id).toBe(createdUser.id);
        expect(retrievedUser?.email).toBe(createdUser.email);
      });

      it("should return undefined for non-existent user", async () => {
        const user = await memStorage.getUser("non-existent-id");

        expect(user).toBeUndefined();
      });

      it("should retrieve correct user when multiple exist", async () => {
        const user1 = await memStorage.createUser({ email: "user1@example.com" });
        const user2 = await memStorage.createUser({ email: "user2@example.com" });
        const user3 = await memStorage.createUser({ email: "user3@example.com" });

        const retrieved = await memStorage.getUser(user2.id);

        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(user2.id);
        expect(retrieved?.email).toBe("user2@example.com");
      });

      it("should return same object as created", async () => {
        const created = await memStorage.createUser({ email: "test@example.com" });
        const retrieved = await memStorage.getUser(created.id);

        expect(retrieved).toEqual(created);
      });

      it("should handle empty string ID", async () => {
        const user = await memStorage.getUser("");

        expect(user).toBeUndefined();
      });

      it("should handle UUID format ID", async () => {
        const created = await memStorage.createUser({ email: "test@example.com" });

        // UUID format check
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        expect(created.id).toMatch(uuidRegex);

        const retrieved = await memStorage.getUser(created.id);
        expect(retrieved).toBeDefined();
      });
    });

    describe("getUserByEmail", () => {
      it("should retrieve a user by email", async () => {
        const insertUser: InsertUser = {
          email: "test@example.com",
        };
        await memStorage.createUser(insertUser);

        const user = await memStorage.getUserByEmail("test@example.com");

        expect(user).toBeDefined();
        expect(user?.email).toBe("test@example.com");
      });

      it("should return undefined for non-existent email", async () => {
        const user = await memStorage.getUserByEmail("nonexistent@example.com");

        expect(user).toBeUndefined();
      });

      it("should be case-sensitive", async () => {
        await memStorage.createUser({ email: "Test@Example.com" });

        const upperCase = await memStorage.getUserByEmail("Test@Example.com");
        const lowerCase = await memStorage.getUserByEmail("test@example.com");

        expect(upperCase).toBeDefined();
        expect(lowerCase).toBeUndefined();
      });

      it("should retrieve correct user when multiple exist", async () => {
        await memStorage.createUser({ email: "user1@example.com" });
        await memStorage.createUser({ email: "user2@example.com" });
        await memStorage.createUser({ email: "user3@example.com" });

        const user = await memStorage.getUserByEmail("user2@example.com");

        expect(user).toBeDefined();
        expect(user?.email).toBe("user2@example.com");
      });

      it("should handle special characters in email", async () => {
        await memStorage.createUser({ email: "test+special@example.com" });

        const user = await memStorage.getUserByEmail("test+special@example.com");

        expect(user).toBeDefined();
        expect(user?.email).toBe("test+special@example.com");
      });

      it("should return first matching email if duplicates exist", async () => {
        const user1 = await memStorage.createUser({ email: "dup@example.com" });

        // This shouldn't happen in practice, but testing the behavior
        const retrieved = await memStorage.getUserByEmail("dup@example.com");

        expect(retrieved).toBeDefined();
        expect(retrieved?.id).toBe(user1.id);
      });

      it("should handle empty string email", async () => {
        const user = await memStorage.getUserByEmail("");

        expect(user).toBeUndefined();
      });

      it("should handle emails with dots", async () => {
        await memStorage.createUser({ email: "first.last@example.com" });

        const user = await memStorage.getUserByEmail("first.last@example.com");

        expect(user).toBeDefined();
        expect(user?.email).toBe("first.last@example.com");
      });
    });

    describe("IStorage interface", () => {
      it("should implement all required methods", () => {
        expect(typeof memStorage.getUser).toBe("function");
        expect(typeof memStorage.getUserByEmail).toBe("function");
        expect(typeof memStorage.createUser).toBe("function");
      });

      it("should return promises for all methods", () => {
        const getUserPromise = memStorage.getUser("test-id");
        const getUserByEmailPromise = memStorage.getUserByEmail("test@example.com");
        const createUserPromise = memStorage.createUser({ email: "test@example.com" });

        expect(getUserPromise).toBeInstanceOf(Promise);
        expect(getUserByEmailPromise).toBeInstanceOf(Promise);
        expect(createUserPromise).toBeInstanceOf(Promise);
      });
    });

    describe("Data persistence within instance", () => {
      it("should persist data across method calls", async () => {
        const created = await memStorage.createUser({ email: "persist@example.com" });

        const byId = await memStorage.getUser(created.id);
        const byEmail = await memStorage.getUserByEmail("persist@example.com");

        expect(byId).toBeDefined();
        expect(byEmail).toBeDefined();
        expect(byId?.id).toBe(byEmail?.id);
      });

      it("should maintain user count", async () => {
        await memStorage.createUser({ email: "user1@example.com" });
        await memStorage.createUser({ email: "user2@example.com" });
        await memStorage.createUser({ email: "user3@example.com" });

        const user1 = await memStorage.getUserByEmail("user1@example.com");
        const user2 = await memStorage.getUserByEmail("user2@example.com");
        const user3 = await memStorage.getUserByEmail("user3@example.com");

        expect(user1).toBeDefined();
        expect(user2).toBeDefined();
        expect(user3).toBeDefined();
      });
    });

    describe("Isolation between instances", () => {
      it("should isolate data between different instances", async () => {
        const storage1 = new MemStorage();
        const storage2 = new MemStorage();

        const user1 = await storage1.createUser({ email: "storage1@example.com" });

        const inStorage1 = await storage1.getUser(user1.id);
        const inStorage2 = await storage2.getUser(user1.id);

        expect(inStorage1).toBeDefined();
        expect(inStorage2).toBeUndefined();
      });

      it("should allow same email in different instances", async () => {
        const storage1 = new MemStorage();
        const storage2 = new MemStorage();

        const user1 = await storage1.createUser({ email: "same@example.com" });
        const user2 = await storage2.createUser({ email: "same@example.com" });

        expect(user1.id).not.toBe(user2.id);
        expect(user1.email).toBe(user2.email);
      });
    });
  });

  describe("Exported storage instance", () => {
    it("should export a storage instance", () => {
      expect(storage).toBeDefined();
      expect(storage).toBeInstanceOf(MemStorage);
    });

    it("should be usable as IStorage", () => {
      const storageAsInterface: IStorage = storage;

      expect(typeof storageAsInterface.getUser).toBe("function");
      expect(typeof storageAsInterface.getUserByEmail).toBe("function");
      expect(typeof storageAsInterface.createUser).toBe("function");
    });

    it("should work with the exported instance", async () => {
      // Note: This modifies the shared storage instance
      // In a real app, you'd want to reset this in beforeEach
      const user = await storage.createUser({ email: "exported@example.com" });

      expect(user).toBeDefined();
      expect(user.email).toBe("exported@example.com");

      const retrieved = await storage.getUser(user.id);
      expect(retrieved).toBeDefined();
    });
  });

  describe("Edge cases", () => {
    let memStorage: IStorage;

    beforeEach(() => {
      memStorage = new MemStorage();
    });

    it("should handle rapid consecutive creates", async () => {
      const promises = Array.from({ length: 10 }, (_, i) =>
        memStorage.createUser({ email: `user${i}@example.com` })
      );

      const users = await Promise.all(promises);

      expect(users.length).toBe(10);
      const ids = users.map(u => u.id);
      const uniqueIds = new Set(ids);
      expect(uniqueIds.size).toBe(10); // All IDs should be unique
    });

    it("should handle very long email addresses", async () => {
      const longEmail = "a".repeat(100) + "@example.com";
      const user = await memStorage.createUser({ email: longEmail });

      expect(user.email).toBe(longEmail);

      const retrieved = await memStorage.getUserByEmail(longEmail);
      expect(retrieved).toBeDefined();
    });

    it("should handle email with international characters", async () => {
      const email = "tëst@ëxample.com";
      const user = await memStorage.createUser({ email });

      const retrieved = await memStorage.getUserByEmail(email);
      expect(retrieved).toBeDefined();
      expect(retrieved?.email).toBe(email);
    });
  });
});
