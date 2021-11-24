var Storage;
var Exceljs;
var moment;
var axios;
var fs;

const downloadFileDir = `/tmp`;
const reportList = [
    'employees',
    'companies',
];

// environment variables
const DEFAULT_COMPANY_CODE  = process.env.DEFAULT_COMPANY_CODE;
const BUCKET_NAME           = process.env.BUCKET_NAME;
const SP_URL                = process.env.SP_URL;
const SP_API_KEY            = process.env.SP_API_KEY;
const SP_UPLOAD_FOLDER      = process.env.SP_UPLOAD_FOLDER;

async function createExcelAndUpload(req, res) {
    Storage = Storage || require('@google-cloud/storage').Storage;

    try {
        const company = req.query.company || DEFAULT_COMPANY_CODE;

        let storage = new Storage();
        let bucket = storage.bucket(BUCKET_NAME);

        // get latest file list for each db extract
        let fileList = await getFileList(bucket, company);

        // download files based on file list
        await downloadFiles(bucket, fileList);

        // create an xlsx file with sheets 
        // based on downloaded csv file
        let fileName = await createExcelFile(fileList);

        // TODO: upload to sharepoint folder instead
        // let bucketUpload = storage.bucket('poc-analytics-extract-xlsx');
        // await bucketUpload.upload(fileName);

        let data = await uploadToSharepoint(fileName);

        res.status(200).json({
            status: 200,
            message: "Success",
            data

        });
    } catch(err) {
        console.error(err);

        res.status(500).json({
            status: 500,
            message: err.message
        });
    }

}

async function getFileList(bucket, company) {
    let fileList = [];

    for (let x = 0; x < reportList.length; x++) {
        // fetch report files under company folder
        let [gcsObjects] = await bucket.getFiles({
            autoPaginate: false,
            prefix: `${company}/${reportList[x]}`,
        });

        let files = gcsObjects
            // map files for usage 
            .map(({ metadata }) => {  
                let { name, timeCreated } = metadata;

                return { 
                    name,
                    fileName: name.split('/')[1], 
                    timeCreated: new Date(timeCreated) 
                };
            })
            // sort descending based on timeCreated
            .sort((a, b) => {
                if (a.timeCreated.getTime() > b.timeCreated.getTime()) return -1;
                if (b.timeCreated.getTime() > a.timeCreated.getTime()) return 1;
                return 0;
            });

        // get the latest file, the first item in the files array
        if (files.length > 0) fileList.push(files[0]);
    }

    return fileList;
}

async function downloadFiles(bucket, fileList) {
    let downloadRequests = [];

    for(let x = 0; x < fileList.length; x++) {
        downloadRequests.push(
            bucket.file(fileList[x].name).download({
                destination: `${downloadFileDir}/${fileList[x].fileName}`
            })
        );
    }

    await Promise.all(downloadRequests);
}

async function createExcelFile(fileList) {
    Exceljs = Exceljs || require('exceljs');
    moment = moment || require('moment');

    let workbook = new Exceljs.Workbook();
    
    for (let x = 0; x < fileList.length; x++) {
        let sheetName = fileList[x].fileName.split('.')[0];
        let fileDir = `${downloadFileDir}/${fileList[x].fileName}`;

        // read downloaded file from download directory
        // this will create a sheet
        await workbook.csv.readFile(fileDir, { sheetName });

        let worksheet = workbook.getWorksheet(sheetName);

        // insert a row for headers
        worksheet.insertRow(0);

        // get column headers based on sheet without date
        worksheet.columns = getColumnHeaders(sheetName.split('_')[0]);
    }

    // write xlsx file to download directory
    const excelFileName = `${downloadFileDir}/report_${moment().format('YYYY-MM-DD')}.xlsx`;

    await workbook.xlsx.writeFile(excelFileName);

    return excelFileName;
}

async function uploadToSharepoint(filename) {
    axios = axios || require('axios');
    fs = fs || require('fs');

    let url = `${SP_URL}/web/GetFolderByServerRelativeUrl('${SP_UPLOAD_FOLDER}')` +
                `/Files/add(overwrite=true, url='${SP_UPLOAD_FOLDER + filename.split('/')[2]}')`;
    
    let data = await fs.readFileSync(filename).buffer;

    let options = {
        headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json;odata=verbose',
            'Authorization': `Bearer ${SP_API_KEY}`
        }
    };

    let { 
        data: response 
    } = await axios.post(url, data, options)
            .catch(err => {
                console.log(err.response.data);
                throw err;
            });

    return response;
}

function getColumnHeaders(sheetName) {
    switch (sheetName) {
        case reportList[0]: return employeesHeaders();
        case reportList[1]: return companiesHeaders();
        default: return null;
    }
}

function employeesHeaders() {
    return [
        { header: 'employee_code', key: 'employee_code' },
        { header: 'company_code', key: 'company_code' },
        { header: 'company', key: 'company' },
        { header: 'account_type', key: 'account_type' },
        { header: 'site_assignment', key: 'site_assignment' },
        { header: 'job_title', key: 'job_title' },
        { header: 'job_level', key: 'job_level' },
        { header: 'employment_type_code', key: 'employment_type_code' },
        { header: 'employment_status_code', key: 'employment_status_code' },
        { header: 'city', key: 'city' },
        { header: 'country', key: 'country' },
        { header: 'gender', key: 'gender' },
        { header: 'marital_status', key: 'marital_status' },
    ]
}

function companiesHeaders() {
    return [
        { header: 'company_code', key: 'company_code' },
        { header: 'comany_name', key: 'comany_name' },
        { header: 'no_of_employees', key: 'no_of_employees' },
    ]
}

module.exports = {
    createExcelAndUpload
}
