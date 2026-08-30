import { fireEvent, render, screen } from '@testing-library/react';
import { CvUploadDropzone } from './CvUploadDropzone';

function makeFile(name: string, type: string, sizeBytes: number): File {
  const file = new File(['x'], name, { type });
  Object.defineProperty(file, 'size', { value: sizeBytes });
  return file;
}

function getFileInput(): HTMLInputElement {
  return document.querySelector('input[type="file"]') as HTMLInputElement;
}

describe('CvUploadDropzone', () => {
  it('shows the idle dropzone with supported-format hint', () => {
    render(<CvUploadDropzone onFileSelected={jest.fn()} />);
    expect(screen.getByText('Arraste o seu CV aqui')).toBeInTheDocument();
    expect(screen.getByText(/PDF, DOCX/)).toBeInTheDocument();
  });

  it('shows the selected file name/size/type once a valid PDF is chosen', () => {
    render(<CvUploadDropzone onFileSelected={jest.fn()} />);
    const file = makeFile('cv.pdf', 'application/pdf', 120_000);
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    expect(screen.getByText('cv.pdf')).toBeInTheDocument();
    expect(screen.getByText(/PDF/)).toBeInTheDocument();
    expect(screen.getByText(/117.2 KB/)).toBeInTheDocument();
  });

  it('accepts a valid DOCX file', () => {
    render(<CvUploadDropzone onFileSelected={jest.fn()} />);
    const file = makeFile(
      'cv.docx',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      50_000,
    );
    fireEvent.change(getFileInput(), { target: { files: [file] } });
    expect(screen.getByText('cv.docx')).toBeInTheDocument();
    expect(screen.getByText(/DOCX/)).toBeInTheDocument();
  });

  it('rejects an unsupported file type with an inline error, and does not enter the selected state', () => {
    render(<CvUploadDropzone onFileSelected={jest.fn()} />);
    const file = makeFile('cv.txt', 'text/plain', 1000);
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    expect(screen.getByRole('alert')).toHaveTextContent('Formato não suportado');
    expect(screen.queryByText('cv.txt')).not.toBeInTheDocument();
  });

  it('rejects an empty file', () => {
    render(<CvUploadDropzone onFileSelected={jest.fn()} />);
    const file = makeFile('empty.pdf', 'application/pdf', 0);
    fireEvent.change(getFileInput(), { target: { files: [file] } });
    expect(screen.getByRole('alert')).toHaveTextContent('vazio');
  });

  it('rejects a file over the 5MB limit', () => {
    render(<CvUploadDropzone onFileSelected={jest.fn()} />);
    const file = makeFile('huge.pdf', 'application/pdf', 6 * 1024 * 1024);
    fireEvent.change(getFileInput(), { target: { files: [file] } });
    expect(screen.getByRole('alert')).toHaveTextContent('excede o limite');
  });

  it('calls onFileSelected with the chosen file when "Importar CV" is clicked', () => {
    const onFileSelected = jest.fn();
    render(<CvUploadDropzone onFileSelected={onFileSelected} />);
    const file = makeFile('cv.pdf', 'application/pdf', 1000);
    fireEvent.change(getFileInput(), { target: { files: [file] } });

    fireEvent.click(screen.getByRole('button', { name: 'Importar CV' }));
    expect(onFileSelected).toHaveBeenCalledWith(file);
  });

  it('clears the selection and returns to the idle dropzone when the remove button is clicked', () => {
    render(<CvUploadDropzone onFileSelected={jest.fn()} />);
    const file = makeFile('cv.pdf', 'application/pdf', 1000);
    fireEvent.change(getFileInput(), { target: { files: [file] } });
    expect(screen.getByText('cv.pdf')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Remover ficheiro' }));
    expect(screen.queryByText('cv.pdf')).not.toBeInTheDocument();
    expect(screen.getByText('Arraste o seu CV aqui')).toBeInTheDocument();
  });
});
