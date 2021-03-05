import logo from './logo.svg';
import './App.css';

const { Component } = require('react');

const axios = require('axios');

 // keep a util handy to dump objects
 const util = require('util');
 //console.log(util.inspect(error, {depth: null}))

 // grab our env variables
 const dotenv = require('dotenv');

class App extends Component {
    constructor(props) {
        super(props);

        // grab our environment vars
        dotenv.config();
    
        // set "the state" (great old school show, btw)
        this.state = {
            apiUrl: 'http://' + process.env.REACT_APP_UPLOAD_API_HOST + ':' + process.env.REACT_APP_UPLOAD_API_PORT,
            fileTypeSelectOptions: [],
            fileTypeSelectOptionsValue: 0,
            fileTypeInfo: [],
            selectedFile: '',
            fileTypeHelp: '',
            fileTable: [],
            statusElement: '',
            uploadTable: []
        };
    }

    componentDidMount() {  
        // grab our file type info 
        axios.get(this.state.apiUrl + '/getFileTypes').then(response => {
            const data = response.data.data;
            this.setState({ fileTypeInfo: data });
            this.setState({ fileTypeHelp: data[this.state.fileTypeSelectOptionsValue].help });
        }).catch(response => {
            if(!response.data) {
                this.setState({ statusElement: <div id='Status' className='alert alert-danger'>Problem accessing back-end</div>});
            } else {
                this.setState({ statusElement: <div id='Status' className='alert alert-danger'>{response.data.message}</div>});
            }
        });

        // grab list of files and build our table
        this.setFilesTable();
    }

    onDeleteClick = (id, event) => {
        /*
        // set up some headers
        const options = {
            headers: {'Content-Type': 'application/json; charset=utf-8'}
        };

        // nuke the file from S3 and the database using query strings
        //axios.delete(this.state.apiUrl + '/deleteFile?id=' + event.target.dataset.id, options);
        axios.delete(this.state.apiUrl + '/deleteFile?id=' + id, options);
        */

        // nuke the file from S3 and the database using JSON in body
        axios.delete(
            this.state.apiUrl + '/deleteFile', {
                headers: {
                    'Content-Type': 'application/json; charset=utf-8'
                },
                data: {
                    'id': id
                }
        }).then(response => {
            this.setState({ statusElement: <div id='Status' className='alert alert-success'>{response.data.message}</div>});

            // refresh the files table
            this.setFilesTable();
        }).catch(response => {
            if(!response.data) {
                this.setState({ statusElement: <div id='Status' className='alert alert-danger'>Problem accessing back-end</div>});
            } else {
                this.setState({ statusElement: <div id='Status' className='alert alert-danger'>{response.data.message}</div>});
            }
        });
    }

    onDownloadClick = (id, event) => {
        //axios.get(this.state.apiUrl + '/getUrl?id=' + event.target.dataset.id).then(response => {
        axios.get(this.state.apiUrl + '/getUrl?id=' + id).then(response => {
            window.open(response.data.url, '_blank', 'noopener,noreferrer')
        }).catch(response => {
            if(!response.data) {
                this.setState({ statusElement: <div id='Status' className='alert alert-danger'>Problem accessing back-end</div>});
            } else {
                this.setState({ statusElement: <div id='Status' className='alert alert-danger'>{response.data.message}</div>});
            }
        });
    }
  
    // On file select (from the pop up)
    onFileChange = event => {
        // Update the state
        this.setState({ selectedFile: event.target.files[0] });
    };

    // On file type select
    onTypeChange = event => {
        // Update the state
        this.setState({ fileTypeHelp: this.state.fileTypeInfo[event.target.value].help });
        this.setState({ fileTypeSelectOptionsValue: event.target.value });
    };

    // On description change
    onDescChange = event => {
        // Update the state
        this.setState({ description: event.target.value });
    };
  
    // On file upload (click the upload button)
    onSubmit = event => {
        // Was the fileTypeInfo state populated?
        if(!this.state.fileTypeInfo[this.state.fileTypeSelectOptionsValue]) {
            this.setState({ statusElement: <div id='Status' className='alert alert-danger'>Missing file type info</div>});
            return;
        }

        // was a file selected?
        if(!this.state.selectedFile.name) {
            this.setState({ statusElement: <div id='Status' className='alert alert-danger'>Please select a file to upload</div>});
            return;
        }

        // Create a formData object to help transmit our file
        const formData = new FormData();

        // Append the file to the formData object
        formData.append(
            "file",
            this.state.selectedFile,
            this.state.selectedFile.name
        );

        // append the file type to the formData object
        formData.append(
            "fileType",
            this.state.fileTypeInfo[this.state.fileTypeSelectOptionsValue].type
        );

        // append the file description to the formData object
        formData.append(
            "description",
            this.state.description
        );

	    // Make the request to the backend api
        axios.post(this.state.apiUrl + '/uploadFile', formData).then(response => {
            this.setState({ statusElement: <div id='Status' className='alert alert-success'>{response.data.message}</div>});

            // refresh the files table
            this.setFilesTable();
        }).catch(response => {
            if(!response.response) {
                this.setState({ statusElement: <div id='Status' className='alert alert-danger'>Problem accessing back-end</div>});
            } else {
                this.setState({ statusElement: <div id='Status' className='alert alert-danger'>{response.response.data.message}</div>});
            }
        });
    };

    getfileTypeSelectOptions = () => {
        const data = this.state.fileTypeInfo;

        const selectOptions = [];

        for(let i = 0; i < data.length; i++) {
            selectOptions.push(<option value={i} key={i}>{data[i].text}</option>);
        } 
        return selectOptions;
    }
  
    getfileData = () => {
        if (this.state.selectedFile) {
            return (
                <p className='m-t-10px'>File Name: {this.state.selectedFile.name}</p>
            );
        } 
    };

    setFilesTable = () => {
        // grab list of files and build a table
        axios.get(this.state.apiUrl + '/getFiles').then(response => {
            const data = response.data.data;
            const tableRows = [];

            for(let i = 0; i < data.length; i++) {
                tableRows.push(<tr key={i}>
                        <td>{data[i].name}</td>
                        <td>{data[i].description}</td>
                        <td className='Download-Column'>
                            <button className='btn btn-success btn-sm' onClick={this.onDownloadClick.bind(this, data[i]._id)}>
                                <span></span> Download
                            </button>
                        </td>
                        <td className='Delete-Column'>
                            <button className='btn btn-danger btn-sm' onClick={this.onDeleteClick.bind(this, data[i]._id)}>
                                <span></span> Delete
                            </button>
                        </td>
                    </tr>
                );
            }  

            const fileTable = <table className='table table-hover table-bordered table-striped m-t-15px'>
                <tbody>
                    {tableRows}
                </tbody>
            </table>;

            this.setState({ fileTable: fileTable });
        }).catch(response => {
            if(!response.data) {
                this.setState({ statusElement: <div id='Status' className='alert alert-danger'>Problem accessing back-end</div>});
            } else {
                this.setState({ statusElement: <div id='Status' className='alert alert-danger'>{response.data.message}</div>});
            }
        });
    }

    render() {
        return (
            <>
                <div className='App'>
                    <header className='App-header'>
                        <img src={logo} className='App-logo' alt='logo' />
                    </header>
                    <div id='Main'>
                        {this.state.statusElement}
                        <table className='table table-hover table-bordered'>
                            <tbody>
                                <tr>
                                    <td className='w-15-pct'>Description</td>
                                    <td><input type='text' className='form-control' onChange={this.onDescChange.bind(this)} required /></td>
                                </tr>
                                <tr>
                                    <td className='w-15-pct'>Type</td>
                                    <td>
                                        <select className='Left m-l-10px' onChange={this.onTypeChange.bind(this)} value={this.state.fileTypeSelectOptionsValue} required>
                                            {this.getfileTypeSelectOptions()}
                                        </select>
                                    </td>
                                </tr>
                                <tr>
                                    <td className='w-15-pct'>Image</td>
                                    <td>
                                        <input type='file' className='form-control' onChange={this.onFileChange.bind(this)} required />
                                        <small className='form-text text-muted'>{this.state.fileTypeHelp}</small>
                                    </td>
                                </tr>
                            </tbody>
                        </table>
                        <button type='button' className='btn btn-primary' onClick={this.onSubmit.bind(this)}>
                            <span></span> Upload File
                        </button>
                        {this.getfileData()}
                        {this.state.fileTable}
                    </div>
                </div>
            </>
        );
    }
}

export default App;