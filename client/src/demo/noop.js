// Rate limiting has no meaning inside a single browser tab.
export default function rateLimit() {
  return (req, res, next) => next();
}
