const handleSubmit = async (e) => {
  e.preventDefault();
  setLoading(true);
  setError('');

  try {
    const res = await fetch('/api/convert', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, genre }),
    });

    const text = await res.text();
    let data;

    try {
      data = JSON.parse(text);
    } catch (parseErr) {
      throw new Error('O servidor instabilizou temporariamente. Tente novamente em alguns segundos.');
    }

    if (!res.ok) throw new Error(data.error || 'Erro ao adicionar música.');

    setUrl('');
    await refreshPlaylist();
  } catch (err) {
    setError(err.message);
  } finally {
    setLoading(false);
  }
};