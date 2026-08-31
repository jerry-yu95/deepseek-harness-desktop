import assert from 'node:assert/strict'
import test from 'node:test'

import { isAllowedWeChatResource, normalizeWeChatArticleUrl, projectWeChatArticle } from '../src/knowledge-browser-import.mjs'

test('knowledge browser import accepts only exact HTTPS WeChat article links', () => {
  assert.equal(normalizeWeChatArticleUrl('https://mp.weixin.qq.com/s/example#comments').toString(), 'https://mp.weixin.qq.com/s/example')
  assert.throws(() => normalizeWeChatArticleUrl('https://mp.weixin.qq.com.example.com/s/example'), /only supports/u)
  assert.throws(() => normalizeWeChatArticleUrl('http://mp.weixin.qq.com/s/example'), /only supports/u)
  assert.throws(() => normalizeWeChatArticleUrl('https://mp.weixin.qq.com/cgi-bin/home'), /only supports/u)
})

test('knowledge browser import request policy blocks arbitrary and non-HTTPS resources', () => {
  assert.equal(isAllowedWeChatResource('https://mp.weixin.qq.com/s/example'), true)
  assert.equal(isAllowedWeChatResource('https://res.wx.qq.com/app.js'), true)
  assert.equal(isAllowedWeChatResource('https://mmbiz.qpic.cn/image'), true)
  assert.equal(isAllowedWeChatResource('http://mp.weixin.qq.com/s/example'), false)
  assert.equal(isAllowedWeChatResource('https://127.0.0.1/private'), false)
  assert.equal(isAllowedWeChatResource('https://evil.example/resource'), false)
})

test('knowledge browser import returns a bounded provenance-backed snapshot', () => {
  const url = new URL('https://mp.weixin.qq.com/s/example')
  const result = projectWeChatArticle({ title: ' Agent \n 知识库 ', author: ' Datawhale ', text: '原始轨迹、持久知识与可执行技能构成三层架构。' }, url)
  assert.equal(result.title, 'Agent 知识库')
  assert.match(result.snapshot, /^作者：Datawhale/u)
  assert.equal(result.source.uri, url.toString())
  assert.equal(result.source.mimeType, 'text/html')
})
