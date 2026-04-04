function getOrigin(event) {
  const headers = (event && event.headers) || {}
  const proto =
    headers['x-forwarded-proto'] ||
    headers['X-Forwarded-Proto'] ||
    headers['x-forwarded-protocol'] ||
    'https'
  const host = headers.host || headers.Host
  if (host) return `${proto}://${host}`
  return null
}

module.exports = { getOrigin }

