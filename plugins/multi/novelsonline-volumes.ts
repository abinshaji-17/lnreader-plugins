import { Plugin } from "@typings/plugin";
import { fetchApi } from "@libs/fetch";
import { CheerioAPI, load } from "cheerio";
import { defaultCover } from "@libs/defaultCover";

class NovelsonlinePlugin implements Plugin.PluginBase {
  id = "novelsonline-volumes";
  name = "Novelsonline (Volumes)";
  icon = "src/multi/novelsonline-volumes/icon.png";
  site = "https://novelsonline.org";
  version = "1.0.0";

  // ---- Helpers ----

  private async safeFetch(url: string, init?: RequestInit): Promise<CheerioAPI> {
    const res = await fetchApi(url, init);
    if (!res.ok) {
      throw new Error(
        `Could not reach site (${res.status}) – try opening in WebView.`
      );
    }
    const $ = load(await res.text());

    if (!$("title").length) {
      throw new Error(
        "Unexpected response (possibly Cloudflare / captcha). Try WebView."
      );
    }

    return $;
  }

  private toRelativePath(fullOrRelative: string): string {
    if (!fullOrRelative) return "";
    if (fullOrRelative.startsWith(this.site)) {
      return fullOrRelative.replace(this.site, "");
    }
    return fullOrRelative;
  }

  // ---- Popular / Latest ----

  async popularNovels(
    pageNo: number,
    { showLatestNovels }: Plugin.PopularNovelsOptions
  ): Promise<Plugin.NovelItem[]> {
    const url = showLatestNovels
      ? `${this.site}/updated/${pageNo}`
      : `${this.site}/top-novel/${pageNo}`;

    const $ = await this.safeFetch(url);
    const novels: Plugin.NovelItem[] = [];

    $("div.top-novel-block").each((_, el) => {
      const name = $(el).find("h2.top-novel-header a").text().trim();
      const href = $(el).find("h2.top-novel-header a").attr("href") || "";
      const cover =
        $(el).find(".top-novel-cover img").attr("src") || defaultCover;

      const path = this.toRelativePath(href);

      if (name && path) {
        novels.push({ name, path, cover });
      }
    });

    return novels;
  }

  // ---- Novel + Chapters ----

  async parseNovel(novelPath: string): Promise<Plugin.SourceNovel> {
    const url = `${this.site}${novelPath}`;
    const $ = await this.safeFetch(url);

    const novel: Plugin.SourceNovel = {
      path: novelPath,
      name: $("h1.novel-title, h1").first().text().trim() || "Untitled",
      cover:
        $(".novel-cover").find("a > img").attr("src") ||
        $("div.novel-cover img").attr("src") ||
        defaultCover,
      summary: $(
        "div#novel-page-synopsis, .novel-detail-item:contains('Description') .novel-detail-body"
      )
        .first()
        .text()
        .trim(),
      author: "",
      status: "",
      genres: "",
      chapters: [],
    };

    $(".novel-detail-item").each((_, el) => {
      const label = $(el).find("h6").text().trim();
      const body = $(el).find(".novel-detail-body");

      switch (label) {
        case "Genre":
          novel.genres = body
            .find("li")
            .map((__, li) => $(li).text().trim())
            .get()
            .join(", ");
          break;
        case "Author(s)":
          novel.author = body
            .find("li")
            .map((__, li) => $(li).text().trim())
            .get()
            .join(", ");
          break;
        case "Status":
          novel.status = body.text().trim();
          break;
      }
    });

    novel.chapters = this._parseChaptersWithVolumes($);
    return novel;
  }

  private _parseChaptersWithVolumes($: CheerioAPI): Plugin.ChapterItem[] {
    const chapters: Plugin.ChapterItem[] = [];
    let chapterIndex = 1;

    $("div.item a[href*='novelsonline']").each((_, el) => {
      const href = $(el).attr("href") || "";
      const rawName = $(el).text().trim();

      if (!href) return;

      const path = this.toRelativePath(href);

      // Extract volume number from URL e.g. /volume-2/chapter-10/
      const volMatch = path.match(/\/volume-(\d+(?:\.\d+)?)\//i);
      const volumeNo = volMatch ? parseFloat(volMatch[1]) : undefined;

      chapters.push({
        name: rawName,
        path,
        chapterNumber: chapterIndex++,
        volumeNo,
      });
    });

    return chapters;
  }

  // ---- Chapter ----

  async parseChapter(chapterPath: string): Promise<string> {
    const url = `${this.site}${chapterPath}`;
    const $ = await this.safeFetch(url);
    return $("#contentall, #chapter-content").html() || "";
  }

  // ---- Search ----

  async searchNovels(
    searchTerm: string,
    pageNo: number
  ): Promise<Plugin.NovelItem[]> {
    if (pageNo !== 1) return [];

    const form = new URLSearchParams();
    form.append("keyword", searchTerm);
    form.append("search", "1");

    const $ = await this.safeFetch(`${this.site}/detailed-search`, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: form.toString(),
    });

    const novels: Plugin.NovelItem[] = [];

    $(".top-novel-block").each((_, el) => {
      const name = $(el).find("h2").text().trim();
      const href = $(el).find("h2 a").attr("href") || "";
      const cover =
        $(el).find(".top-novel-cover img").attr("src") || defaultCover;

      const path = this.toRelativePath(href);

      if (name && path) {
        novels.push({ name, cover, path });
      }
    });

    return novels;
  }
}

export default new NovelsonlinePlugin();

