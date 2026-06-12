import { describe, it, expect } from "vitest";
import { normalizeImageUrl } from "@/lib/image-url";

describe("normalizeImageUrl", () => {
  it("rewrites Google Drive /file/d/<id>/view share links", () => {
    expect(
      normalizeImageUrl("https://drive.google.com/file/d/1AbC_dEf-123/view?usp=drive_link"),
    ).toBe("https://lh3.googleusercontent.com/d/1AbC_dEf-123");
  });

  it("rewrites Google Drive open?id= links", () => {
    expect(normalizeImageUrl("https://drive.google.com/open?id=XYZ789")).toBe(
      "https://lh3.googleusercontent.com/d/XYZ789",
    );
  });

  it("rewrites Google Drive uc?id= links", () => {
    expect(normalizeImageUrl("https://drive.google.com/uc?id=QQQ&export=view")).toBe(
      "https://lh3.googleusercontent.com/d/QQQ",
    );
  });

  it("rewrites Dropbox share links to the direct-content host", () => {
    expect(normalizeImageUrl("https://www.dropbox.com/s/abc/poster.jpg?dl=0")).toBe(
      "https://dl.dropboxusercontent.com/s/abc/poster.jpg",
    );
  });

  it("passes ordinary image URLs through untouched", () => {
    const url = "https://images.unsplash.com/photo-123?w=1200&q=80";
    expect(normalizeImageUrl(url)).toBe(url);
  });

  it("passes invalid input through untouched", () => {
    expect(normalizeImageUrl("not a url")).toBe("not a url");
  });
});
