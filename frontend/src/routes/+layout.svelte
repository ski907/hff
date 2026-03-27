<slot />

<style>
  :global(*) {
    box-sizing: border-box;
    margin: 0;
    padding: 0;
  }

  :global(body) {
    background: #0f1318;
    color: #e6edf3;
    font-family: 'IBM Plex Sans', 'Segoe UI', sans-serif;
    min-height: 100vh;
  }

  :global(input[type='number'], input[type='text']) {
    background: #0d1117;
    border: 1px solid #30363d;
    color: #e6edf3;
    padding: 7px 10px;
    border-radius: 6px;
    font-family: 'IBM Plex Mono', monospace;
    font-size: 13px;
    width: 100%;
    outline: none;
    transition: border-color 0.15s;
  }

  :global(input[type='number']:focus, input[type='text']:focus) {
    border-color: #58a6ff;
  }

  :global(label) {
    font-size: 10px;
    letter-spacing: 1.5px;
    text-transform: uppercase;
    color: #7d8590;
    font-family: 'IBM Plex Mono', monospace;
    display: block;
    margin-bottom: 4px;
  }
</style>
