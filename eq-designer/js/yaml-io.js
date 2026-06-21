function serializeYAML(eqModel) {
  const obj = eqModel.toJSON();
  return jsyaml.dump(obj, {
    indent: 2,
    lineWidth: 120,
    sortKeys: false,
    noRefs: true
  });
}

function deserializeYAML(text) {
  return jsyaml.load(text);
}

function downloadYAML(eqModel, filename) {
  const yaml = serializeYAML(eqModel);
  const blob = new Blob([yaml], { type: 'text/yaml;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename || 'biquad-eq.yaml';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function loadYAMLFromFile(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const obj = deserializeYAML(e.target.result);
        resolve(obj);
      } catch (err) {
        reject(new Error('Failed to parse YAML: ' + err.message));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read file'));
    reader.readAsText(file);
  });
}
