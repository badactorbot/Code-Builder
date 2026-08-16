import { Router } from 'express';

const router = Router();

const KRON_IDX = 'https://idx.kron.technology';

// Proxy for Kron KCC-20 indexer — CORS on idx.kron.technology is locked
// to kron.technology only, so the browser cannot call it directly.
router.get('/kcc20/address/:address/tokenlist', async (req, res) => {
  const { address } = req.params;
  try {
    const upstream = await fetch(
      `${KRON_IDX}/v1/kcc20/address/${encodeURIComponent(address)}/tokenlist`,
    );
    const data = await upstream.json();
    res.json(data);
  } catch (err: any) {
    res.status(502).json({ error: 'Failed to reach Kron indexer', detail: err?.message });
  }
});

export default router;
