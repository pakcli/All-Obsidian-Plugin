import { requestUrl } from 'obsidian';

export interface DocmostSpace {
  id: string;
  name: string;
  slug: string;
}

export interface DocmostPage {
  id: string;
  title: string;
  slugId: string;
  spaceId: string;
  content?: any;
}

export class DocmostApiClient {
  private baseUrl: string;
  private token: string;

  constructor(baseUrl: string, token: string = '') {
    this.baseUrl = baseUrl.replace(/\/+$/, '');
    this.token = token;
  }

  setToken(token: string) {
    this.token = token;
  }

  private getHeaders(): Record<string, string> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
    };
    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }
    return headers;
  }

  async login(email: string, password: string): Promise<string> {
    const url = `${this.baseUrl}/api/auth/login`;
    const response = await requestUrl({
      url,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (response.status >= 200 && response.status < 300) {
      const data = response.json;
      const token = data?.token || data?.data?.token;
      if (token) {
        this.token = token;
        return token;
      }
    }
    throw new Error(`Login failed with status ${response.status}`);
  }

  async getSpaces(): Promise<DocmostSpace[]> {
    const url = `${this.baseUrl}/api/spaces`;
    const response = await requestUrl({
      url,
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status === 200) {
      return response.json?.data || response.json || [];
    }
    return [];
  }

  async getPages(spaceId: string): Promise<DocmostPage[]> {
    const url = `${this.baseUrl}/api/pages/space/${spaceId}`;
    const response = await requestUrl({
      url,
      method: 'GET',
      headers: this.getHeaders(),
    });

    if (response.status === 200) {
      return response.json?.data || response.json || [];
    }
    return [];
  }

  async createPage(spaceId: string, title: string, contentMarkdown: string): Promise<any> {
    const url = `${this.baseUrl}/api/pages/create`;
    const response = await requestUrl({
      url,
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        spaceId,
        title,
        content: contentMarkdown,
        format: 'markdown',
      }),
    });

    return response.json;
  }

  async updatePage(pageId: string, title: string, contentMarkdown: string): Promise<any> {
    const url = `${this.baseUrl}/api/pages/update`;
    const response = await requestUrl({
      url,
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({
        pageId,
        title,
        content: contentMarkdown,
        format: 'markdown',
      }),
    });

    return response.json;
  }

  async getPageMarkdown(pageId: string): Promise<string> {
    const url = `${this.baseUrl}/api/pages/info`;
    const response = await requestUrl({
      url,
      method: 'POST',
      headers: this.getHeaders(),
      body: JSON.stringify({ pageId, format: 'markdown' }),
    });

    if (response.status === 200) {
      return response.json?.content || '';
    }
    return '';
  }
}
