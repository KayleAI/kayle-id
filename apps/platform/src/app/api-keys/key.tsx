type Key = {
  id: string;
  name: string;
};

export function ApiKey({ apiKey }: { apiKey: Key }) {
  return (
    <div>
      ApiKey<pre>{JSON.stringify(apiKey, null, 2)}</pre>
    </div>
  );
}
