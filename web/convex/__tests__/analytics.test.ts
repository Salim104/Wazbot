import { describe, it, expect } from "vitest";
import { groupContactsByDate } from "../utils";

describe("groupContactsByDate Utility", () => {
  it("should return an empty array for empty inputs", () => {
    const result = groupContactsByDate([]);
    expect(result).toEqual([]);
  });

  it("should group contacts by date correctly", () => {
    const now = Date.now();
    const mockContacts = [
      { _creationTime: now },
      { _creationTime: now },
      { _creationTime: now - 86400000 }, // Yesterday
    ];

    const result = groupContactsByDate(mockContacts);
    
    expect(result).toHaveLength(2);
    expect(result[result.length - 1].count).toBe(2); // Today
    expect(result[0].count).toBe(1); // Yesterday
  });

  it("should return at most 7 days of data", () => {
    const mockContacts = [];
    for (let i = 0; i < 10; i++) {
       // Create 1 contact per day for 10 days
       mockContacts.push({ _creationTime: Date.now() - (i * 86400000) });
    }

    const result = groupContactsByDate(mockContacts);
    expect(result.length).toBe(7);
  });

  it("should sort data by date ascending", () => {
     const now = Date.now();
     const mockContacts = [
        { _creationTime: now }, // Today
        { _creationTime: now - 86400000 }, // Yesterday
     ];

     const result = groupContactsByDate(mockContacts);
     expect(result[0].date < result[1].date).toBe(true);
  });
});
