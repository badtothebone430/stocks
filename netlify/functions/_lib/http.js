function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  }
}

function badRequest(message, extra = {}) {
  return json(400, { error: message, ...extra })
}

function serverError(message, extra = {}) {
  return json(500, { error: message, ...extra })
}

function methodNotAllowed(allow = ['GET']) {
  return {
    statusCode: 405,
    headers: { Allow: allow.join(', ') },
    body: 'Method Not Allowed',
  }
}

function readJsonBody(event) {
  if (!event || !event.body) return null
  try {
    return JSON.parse(event.body)
  } catch {
    return null
  }
}

module.exports = { json, badRequest, serverError, methodNotAllowed, readJsonBody }

